"use server";

import { readFile } from "node:fs/promises";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { prisma } from "@/lib/prisma";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import {
  extractGoogleDriveFolderId,
  getGoogleOAuthConfig,
  isGoogleReconnectRequiredError,
  refreshGoogleAccessToken
} from "@/lib/google-drive";
import { getGoogleDriveRefreshToken } from "@/lib/google-settings";
import {
  ensurePaymentHistorySheetUploaded,
  PaymentHistoryUploadAlreadyRunningError
} from "@/lib/services/payment-history-upload";

export async function createPaymentHistorySheetForAttachment({
  patientId,
  attachmentId,
  googleFolderInput
}: {
  patientId: string;
  attachmentId: string;
  googleFolderInput?: string;
}) {
  const hasActive = await prisma.paymentHistorySheet.findFirst({
    where: {
      patientId,
      isActive: true
    },
    select: { id: true }
  });
  const googleFolderId = extractGoogleDriveFolderId(googleFolderInput ?? "");

  const sheet = await prisma.paymentHistorySheet.create({
    data: {
      patientId,
      attachmentId,
      googleFolderId: googleFolderId || null,
      uploadStatus: "LOCAL_ONLY",
      isActive: !hasActive
    }
  });

  await recordAudit("payment_history.created", "PaymentHistorySheet", sheet.id, {
    patientId,
    attachmentId
  });

  if (!googleFolderId) return sheet;

  return uploadPaymentHistorySheet({
    sheetId: sheet.id,
    googleFolderId,
    failAsLocalOnly: true
  });
}

export async function setActivePaymentHistorySheet(formData: FormData) {
  const patientId = String(formData.get("patientId") ?? "");
  const sheetId = String(formData.get("sheetId") ?? "");

  if (!patientId || !sheetId) throw new Error("Historial inválido");

  await prisma.$transaction([
    prisma.paymentHistorySheet.updateMany({
      where: { patientId },
      data: { isActive: false }
    }),
    prisma.paymentHistorySheet.update({
      where: { id: sheetId },
      data: { isActive: true }
    })
  ]);

  await recordAudit("payment_history.active_changed", "PaymentHistorySheet", sheetId, { patientId });
  revalidatePath(`/patients/${patientId}`);
}

export async function retryPaymentHistorySheetUpload(formData: FormData) {
  const sheetId = String(formData.get("sheetId") ?? "");
  const googleFolderInput = String(formData.get("googleFolderId") ?? "");

  if (!sheetId) throw new Error("Historial inválido");

  const sheet = await prisma.paymentHistorySheet.findUnique({
    where: { id: sheetId }
  });

  if (!sheet) throw new Error("Historial no encontrado");

  const googleFolderId = extractGoogleDriveFolderId(googleFolderInput || sheet.googleFolderId || "");
  if (!googleFolderId) {
    await prisma.paymentHistorySheet.update({
      where: { id: sheetId },
      data: {
        uploadStatus: "LOCAL_ONLY",
        errorMessage: "Agrega una carpeta de Google Drive para subir este historial"
      }
    });
    revalidatePath(`/patients/${sheet.patientId}`);
    return;
  }

  await uploadPaymentHistorySheet({
    sheetId,
    googleFolderId,
    failAsLocalOnly: false
  });
}

async function uploadPaymentHistorySheet({
  sheetId,
  googleFolderId,
  failAsLocalOnly
}: {
  sheetId: string;
  googleFolderId: string;
  failAsLocalOnly: boolean;
}) {
  const sheetWithFile = await prisma.paymentHistorySheet.findUnique({
    where: { id: sheetId },
    include: {
      attachment: {
        include: { patient: true }
      }
    }
  });

  if (!sheetWithFile) throw new Error("Historial no encontrado");

  const config = getGoogleOAuthConfig();
  const refreshToken = await getGoogleDriveRefreshToken();

  if (!config || !refreshToken) {
    const sheet = await prisma.paymentHistorySheet.update({
      where: { id: sheetId },
      data: {
        googleFolderId,
        uploadStatus: failAsLocalOnly ? "LOCAL_ONLY" : "FAILED",
        errorMessage: failAsLocalOnly ? null : "Conecta Google antes de subir este historial"
      }
    });
    revalidatePath(`/patients/${sheet.patientId}`);
    return sheet;
  }

  let uploadServiceStarted = false;
  try {
    const settings = await getClinicSettings();
    const absolutePath = resolveLinkedAttachmentPath({
      patientsRootPath: settings.patientsRootPath,
      patientFolderRelativePath: sheetWithFile.attachment.patient.localFolderRelativePath,
      localRelativePath: sheetWithFile.attachment.localRelativePath
    });
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    uploadServiceStarted = true;
    const upload = await ensurePaymentHistorySheetUploaded({
      sheetId,
      patientId: sheetWithFile.patientId,
      accessToken,
      targetFolderId: googleFolderId,
      fileName: sheetWithFile.attachment.originalName,
      loadFileBuffer: () => readFile(absolutePath),
    });

    await recordAudit("payment_history.uploaded", "PaymentHistorySheet", sheetId, {
      patientId: sheetWithFile.patientId,
      attachmentId: sheetWithFile.attachmentId,
      googleFileId: upload.id
    });
    revalidatePath(`/patients/${sheetWithFile.patientId}`);
    return prisma.paymentHistorySheet.findUnique({ where: { id: sheetId } });
  } catch (error) {
    if (error instanceof PaymentHistoryUploadAlreadyRunningError) {
      revalidatePath(`/patients/${sheetWithFile.patientId}`);
      return prisma.paymentHistorySheet.findUnique({ where: { id: sheetId } });
    }
    const failureMessage = isGoogleReconnectRequiredError(error)
      ? "El acceso a Google expiró o fue revocado. Reconecta Google en la pestaña Importar."
      : error instanceof Error ? error.message : "No se pudo subir a Google Sheets";
    const sheet = uploadServiceStarted
      ? await prisma.paymentHistorySheet.findUnique({ where: { id: sheetId } })
      : await prisma.paymentHistorySheet.update({
        where: { id: sheetId },
        data: {
          googleFolderId,
          uploadStatus: "FAILED",
          errorMessage: failureMessage
        }
      });

    await recordAudit("payment_history.upload_failed", "PaymentHistorySheet", sheetId, {
      patientId: sheetWithFile.patientId,
      attachmentId: sheetWithFile.attachmentId,
      message: sheet?.errorMessage ?? failureMessage
    });
    revalidatePath(`/patients/${sheetWithFile.patientId}`);
    return sheet;
  }
}
