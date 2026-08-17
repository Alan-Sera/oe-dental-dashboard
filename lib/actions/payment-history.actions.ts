"use server";

import { readFile } from "node:fs/promises";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { prisma } from "@/lib/prisma";
import { resolveVaultPath } from "@/lib/local-paths";
import {
  extractGoogleDriveFolderId,
  getGoogleOAuthConfig,
  refreshGoogleAccessToken,
  uploadXlsxAsGoogleSheet
} from "@/lib/google-drive";
import { getGoogleRefreshToken } from "@/lib/google-settings";

export async function createPaymentHistorySheetForAttachment({
  patientId,
  attachmentId,
  originalName,
  vaultPath,
  googleFolderInput
}: {
  patientId: string;
  attachmentId: string;
  originalName: string;
  vaultPath: string;
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
    patientId,
    attachmentId,
    originalName,
    vaultPath,
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
    where: { id: sheetId },
    include: { attachment: true }
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
    patientId: sheet.patientId,
    attachmentId: sheet.attachmentId,
    originalName: sheet.attachment.originalName,
    vaultPath: sheet.attachment.vaultPath,
    googleFolderId,
    failAsLocalOnly: false
  });
}

async function uploadPaymentHistorySheet({
  sheetId,
  patientId,
  attachmentId,
  originalName,
  vaultPath,
  googleFolderId,
  failAsLocalOnly
}: {
  sheetId: string;
  patientId: string;
  attachmentId: string;
  originalName: string;
  vaultPath: string;
  googleFolderId: string;
  failAsLocalOnly: boolean;
}) {
  const config = getGoogleOAuthConfig();
  const refreshToken = await getGoogleRefreshToken();

  if (!config || !refreshToken) {
    const sheet = await prisma.paymentHistorySheet.update({
      where: { id: sheetId },
      data: {
        googleFolderId,
        uploadStatus: failAsLocalOnly ? "LOCAL_ONLY" : "FAILED",
        errorMessage: failAsLocalOnly ? null : "Conecta Google antes de subir este historial"
      }
    });
    revalidatePath(`/patients/${patientId}`);
    return sheet;
  }

  try {
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    const upload = await uploadXlsxAsGoogleSheet({
      accessToken,
      fileName: originalName,
      fileBuffer: await readFile(resolveVaultPath(vaultPath)),
      folderId: googleFolderId
    });

    const sheet = await prisma.paymentHistorySheet.update({
      where: { id: sheetId },
      data: {
        googleFileId: upload.id,
        googleUrl: upload.webViewLink,
        googleFolderId,
        uploadStatus: "UPLOADED",
        uploadedAt: new Date(),
        errorMessage: null
      }
    });

    await recordAudit("payment_history.uploaded", "PaymentHistorySheet", sheetId, {
      patientId,
      attachmentId,
      googleFileId: upload.id
    });
    revalidatePath(`/patients/${patientId}`);
    return sheet;
  } catch (error) {
    const sheet = await prisma.paymentHistorySheet.update({
      where: { id: sheetId },
      data: {
        googleFolderId,
        uploadStatus: "FAILED",
        errorMessage: error instanceof Error ? error.message : "No se pudo subir a Google Sheets"
      }
    });

    await recordAudit("payment_history.upload_failed", "PaymentHistorySheet", sheetId, {
      patientId,
      attachmentId,
      message: sheet.errorMessage
    });
    revalidatePath(`/patients/${patientId}`);
    return sheet;
  }
}
