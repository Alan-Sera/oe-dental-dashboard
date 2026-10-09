import "server-only";

import {
  findGoogleDriveResource,
  isGoogleReconnectRequiredError,
  isMissingGoogleDriveResource,
  uploadXlsxAsGoogleSheet,
  verifyGoogleDriveFile
} from "@/lib/google-drive";
import { PAYMENT_HISTORY_UPLOAD_LEASE_MS } from "@/lib/payment-history-upload-state";
import { prisma } from "@/lib/prisma";

export class PaymentHistoryUploadAlreadyRunningError extends Error {
  constructor() {
    super("La subida de este historial ya está en curso.");
    this.name = "PaymentHistoryUploadAlreadyRunningError";
  }
}

export async function ensurePaymentHistorySheetUploaded(input: {
  sheetId: string;
  patientId: string;
  accessToken: string;
  targetFolderId: string;
  fileName: string;
  loadFileBuffer: () => Promise<Buffer>;
}) {
  const currentSheet = await prisma.paymentHistorySheet.findUnique({
    where: { id: input.sheetId },
    select: {
      id: true,
      patientId: true,
      googleFileId: true,
      googleFolderId: true
    }
  });

  if (!currentSheet || currentSheet.patientId !== input.patientId) {
    throw new Error("No se encontró el historial de pagos.");
  }

  const claimedAt = new Date();
  const staleBefore = new Date(claimedAt.getTime() - PAYMENT_HISTORY_UPLOAD_LEASE_MS);
  const claim = await prisma.paymentHistorySheet.updateMany({
    where: {
      id: input.sheetId,
      OR: [
        { uploadStartedAt: null },
        { uploadStartedAt: { lte: staleBefore } }
      ]
    },
    data: {
      uploadStatus: "UPLOADING",
      uploadStartedAt: claimedAt,
      errorMessage: null
    }
  });

  if (claim.count !== 1) throw new PaymentHistoryUploadAlreadyRunningError();

  try {
    let driveSheet: { id: string; webViewLink?: string } | null = null;

    if (currentSheet.googleFileId && currentSheet.googleFolderId === input.targetFolderId) {
      try {
        const savedFile = await verifyGoogleDriveFile(input.accessToken, currentSheet.googleFileId);
        if (
          savedFile.mimeType === "application/vnd.google-apps.spreadsheet" &&
          savedFile.parents?.includes(input.targetFolderId)
        ) {
          driveSheet = {
            id: savedFile.id,
            webViewLink: savedFile.webViewLink
          };
        }
      } catch (error) {
        if (!isMissingGoogleDriveResource(error)) throw error;
      }
    }

    if (!driveSheet) {
      const existing = await findGoogleDriveResource({
        accessToken: input.accessToken,
        parentId: input.targetFolderId,
        patientId: input.patientId,
        resourceType: "payment-sheet",
        paymentHistorySheetId: input.sheetId
      });
      if (existing?.mimeType === "application/vnd.google-apps.spreadsheet") {
        driveSheet = existing;
      } else if (existing) {
        throw new Error("El recurso de Google Drive asociado al historial no es una hoja de cálculo.");
      }
    }

    if (!driveSheet) {
      driveSheet = await uploadXlsxAsGoogleSheet({
        accessToken: input.accessToken,
        fileName: input.fileName,
        fileBuffer: await input.loadFileBuffer(),
        folderId: input.targetFolderId,
        appProperties: {
          oePatientId: input.patientId,
          oeResourceType: "payment-sheet",
          oePaymentHistorySheetId: input.sheetId
        }
      });
    }

    const completed = await prisma.paymentHistorySheet.updateMany({
      where: { id: input.sheetId, uploadStartedAt: claimedAt },
      data: {
        googleFileId: driveSheet.id,
        googleUrl: driveSheet.webViewLink ?? `https://docs.google.com/spreadsheets/d/${driveSheet.id}`,
        googleFolderId: input.targetFolderId,
        uploadStatus: "UPLOADED",
        uploadedAt: new Date(),
        uploadStartedAt: null,
        errorMessage: null
      }
    });
    if (completed.count !== 1) throw new PaymentHistoryUploadAlreadyRunningError();

    return {
      id: driveSheet.id,
      webViewLink: driveSheet.webViewLink ?? `https://docs.google.com/spreadsheets/d/${driveSheet.id}`
    };
  } catch (error) {
    await prisma.paymentHistorySheet.updateMany({
      where: { id: input.sheetId, uploadStartedAt: claimedAt },
      data: {
        googleFolderId: input.targetFolderId,
        uploadStatus: "FAILED",
        uploadStartedAt: null,
        errorMessage: isGoogleReconnectRequiredError(error)
          ? "El acceso a Google expiró o fue revocado. Reconecta Google en la pestaña Importar."
          : error instanceof Error
            ? error.message
            : "No se pudo subir a Google Sheets"
      }
    });
    throw error;
  }
}
