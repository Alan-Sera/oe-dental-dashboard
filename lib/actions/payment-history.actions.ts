"use server";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import {
  extractGoogleDriveFolderId,
  findGoogleDriveResource,
  getGoogleOAuthConfig,
  isGoogleReconnectRequiredError,
  refreshGoogleAccessToken,
  uploadXlsxAsGoogleSheet
} from "@/lib/google-drive";
import { getGoogleDriveRefreshToken } from "@/lib/google-settings";
import {
  ensurePaymentHistorySheetUploaded,
  PaymentHistoryUploadAlreadyRunningError
} from "@/lib/services/payment-history-upload";
import { sha256File } from "@/lib/payment-file-versions";
import { PAYMENT_HISTORY_UPLOAD_LEASE_MS } from "@/lib/payment-history-upload-state";

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
  await requireSession();
  const sheetId = String(formData.get("sheetId") ?? "");
  const googleFolderInput = String(formData.get("googleFolderId") ?? "");

  if (!sheetId) throw new Error("Historial inválido");

  const sheet = await prisma.paymentHistorySheet.findUnique({
    where: { id: sheetId },
    include: { attachment: { include: { patient: true } }, versions: { orderBy: { createdAt: "desc" } } }
  });

  if (!sheet) throw new Error("Historial no encontrado");

  if (sheet.googleFileId) {
    const currentVersion = sheet.versions.find((version) => version.googleFileId === sheet.googleFileId);
    const settings = await getClinicSettings();
    const absolutePath = resolveLinkedAttachmentPath({
      patientsRootPath: settings.patientsRootPath,
      patientFolderRelativePath: sheet.attachment.patient.localFolderRelativePath,
      localRelativePath: sheet.attachment.localRelativePath
    });
    const sourceHash = await sha256File(absolutePath);
    if (!currentVersion?.sourceSha256 || currentVersion.sourceSha256 !== sourceHash) {
      throw new Error("El archivo local no coincide con la hoja actual. Confirma una nueva versión desde el expediente.");
    }
  }

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

export async function createNewPaymentHistoryVersion(input: {
  patientId: string;
  sheetId: string;
  expectedSourceHash: string;
  googleFolderInput: string;
}) {
  await requireSession();
  if (!/^[a-f0-9]{64}$/.test(input.expectedSourceHash)) throw new Error("Versión del archivo inválida.");
  const sheet = await prisma.paymentHistorySheet.findFirst({
    where: { id: input.sheetId, patientId: input.patientId },
    include: { attachment: { include: { patient: true } }, versions: { orderBy: { createdAt: "desc" } } }
  });
  if (!sheet || !sheet.attachment.originalName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Historial de pagos no encontrado.");
  }
  const googleFolderId = extractGoogleDriveFolderId(input.googleFolderInput || sheet.googleFolderId || "");
  if (!googleFolderId) throw new Error("Selecciona una carpeta de Google Drive válida.");
  const settings = await getClinicSettings();
  const absolutePath = resolveLinkedAttachmentPath({
    patientsRootPath: settings.patientsRootPath,
    patientFolderRelativePath: sheet.attachment.patient.localFolderRelativePath,
    localRelativePath: sheet.attachment.localRelativePath
  });
  const before = await stat(absolutePath);
  if (!before.isFile()) throw new Error("El archivo local ya no está disponible.");
  const fileBuffer = await readFile(absolutePath);
  const after = await stat(absolutePath);
  const sourceHash = createHash("sha256").update(fileBuffer).digest("hex");
  if (sourceHash !== input.expectedSourceHash || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error("El archivo cambió de nuevo. Actualiza el expediente antes de subirlo.");
  }
  const currentVersion = sheet.versions.find((version) => version.googleFileId === sheet.googleFileId);
  if (currentVersion?.sourceSha256 === sourceHash && sheet.googleFolderId === googleFolderId) {
    throw new Error("Esta versión del archivo ya está en Google.");
  }
  const config = getGoogleOAuthConfig();
  const refreshToken = await getGoogleDriveRefreshToken();
  if (!config || !refreshToken) throw new Error("Conecta Google antes de subir una nueva versión.");

  const claimedAt = new Date();
  const claim = await prisma.paymentHistorySheet.updateMany({
    where: { id: sheet.id, OR: [
      { uploadStartedAt: null },
      { uploadStartedAt: { lte: new Date(claimedAt.getTime() - PAYMENT_HISTORY_UPLOAD_LEASE_MS) } }
    ] },
    data: { uploadStartedAt: claimedAt }
  });
  if (claim.count !== 1) throw new PaymentHistoryUploadAlreadyRunningError();

  let version: Awaited<ReturnType<typeof prisma.paymentHistorySheetVersion.create>> | null = null;
  try {
    version = await prisma.paymentHistorySheetVersion.findFirst({
      where: { sheetId: sheet.id, sourceSha256: sourceHash, googleFolderId,
        uploadStatus: { in: ["FAILED", "UPLOADING"] } },
      orderBy: { createdAt: "desc" }
    });
    version ??= await prisma.paymentHistorySheetVersion.create({
      data: { sheetId: sheet.id, sourceSha256: sourceHash, sourceSizeBytes: after.size,
        sourceModifiedAt: after.mtime, googleFolderId, uploadStatus: "UPLOADING" }
    });
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    const existing = await findGoogleDriveResource({
      accessToken, parentId: googleFolderId, patientId: input.patientId,
      resourceType: "payment-sheet", paymentHistorySheetId: sheet.id,
      paymentHistorySheetVersionId: version.id
    });
    if (existing && existing.mimeType !== "application/vnd.google-apps.spreadsheet") {
      throw new Error("La versión encontrada en Google no es una hoja de cálculo.");
    }
    const uploaded = existing ?? await uploadXlsxAsGoogleSheet({
      accessToken,
      fileName: sheet.attachment.originalName,
      fileBuffer,
      folderId: googleFolderId,
      appProperties: {
        oePatientId: input.patientId,
        oeResourceType: "payment-sheet",
        oePaymentHistorySheetId: sheet.id,
        oePaymentHistorySheetVersionId: version.id
      }
    });
    const googleUrl = uploaded.webViewLink ?? `https://docs.google.com/spreadsheets/d/${uploaded.id}`;
    await prisma.$transaction(async (tx) => {
      const completed = await tx.paymentHistorySheet.updateMany({
        where: { id: sheet.id, uploadStartedAt: claimedAt },
        data: { googleFileId: uploaded.id, googleUrl, googleFolderId, uploadStatus: "UPLOADED",
          uploadedAt: new Date(), uploadStartedAt: null, errorMessage: null }
      });
      if (completed.count !== 1) throw new PaymentHistoryUploadAlreadyRunningError();
      await tx.paymentHistorySheetVersion.update({
        where: { id: version!.id },
        data: { googleFileId: uploaded.id, googleUrl, uploadStatus: "UPLOADED",
          uploadedAt: new Date(), errorMessage: null }
      });
      await tx.auditLog.create({ data: {
        event: "payment_history.new_version_uploaded", entity: "PaymentHistorySheetVersion",
        entityId: version!.id,
        metadata: JSON.stringify({ patientId: input.patientId, sheetId: sheet.id,
          previousGoogleFileId: sheet.googleFileId, googleFileId: uploaded.id })
      } });
    });
    revalidatePath(`/patients/${input.patientId}`);
    return { versionId: version.id, googleUrl };
  } catch (error) {
    if (version) {
      await prisma.paymentHistorySheetVersion.update({
        where: { id: version.id },
        data: { uploadStatus: "FAILED", errorMessage: error instanceof Error ? error.message : "No se pudo subir la versión." }
      });
    }
    await prisma.paymentHistorySheet.updateMany({
      where: { id: sheet.id, uploadStartedAt: claimedAt }, data: { uploadStartedAt: null }
    });
    throw error;
  }
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
    const beforeRead = await stat(absolutePath);
    const fileBuffer = await readFile(absolutePath);
    const fileStats = await stat(absolutePath);
    if (beforeRead.size !== fileStats.size || beforeRead.mtimeMs !== fileStats.mtimeMs) {
      throw new Error("El archivo cambió mientras se preparaba la subida. Vuelve a intentarlo.");
    }
    const sourceSha256 = createHash("sha256").update(fileBuffer).digest("hex");
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    uploadServiceStarted = true;
    const upload = await ensurePaymentHistorySheetUploaded({
      sheetId,
      patientId: sheetWithFile.patientId,
      accessToken,
      targetFolderId: googleFolderId,
      fileName: sheetWithFile.attachment.originalName,
      loadFileBuffer: async () => fileBuffer,
    });

    const existingVersion = await prisma.paymentHistorySheetVersion.findFirst({
      where: { sheetId, googleFileId: upload.id }
    });
    if (!existingVersion) {
      await prisma.paymentHistorySheetVersion.create({ data: {
        sheetId, sourceSha256, sourceSizeBytes: fileStats.size, sourceModifiedAt: fileStats.mtime,
        googleFileId: upload.id, googleUrl: upload.webViewLink ?? `https://docs.google.com/spreadsheets/d/${upload.id}`,
        googleFolderId, uploadStatus: "UPLOADED", uploadedAt: new Date()
      } });
    }

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
