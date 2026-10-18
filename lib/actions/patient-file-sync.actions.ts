"use server";

import { stat } from "node:fs/promises";

import { revalidatePath } from "next/cache";

import { linkTextAttachmentAsClinicalHistory } from "@/lib/actions/clinical.actions";
import { createPaymentHistorySheetForAttachment } from "@/lib/actions/payment-history.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { requireSession } from "@/lib/auth";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import { getPatientFileSyncRuntime } from "@/lib/patient-file-sync-runtime";
import { prisma } from "@/lib/prisma";
import { isPlainTextAttachment } from "@/lib/text-attachments";

export async function requestPatientFileSync() {
  await requireSession();
  return getPatientFileSyncRuntime().requestFullScan();
}

export async function confirmSpecialPatientFile(input: {
  patientId: string;
  attachmentId: string;
  kind: "text-history" | "payment-history";
}) {
  await requireSession();
  if (input.kind !== "text-history" && input.kind !== "payment-history") {
    throw new Error("Tipo de archivo inválido.");
  }
  const attachment = await prisma.attachment.findFirst({
    where: { id: input.attachmentId, patientId: input.patientId },
    include: { patient: true, paymentHistorySheet: true }
  });
  if (!attachment) throw new Error("Archivo no encontrado en este expediente.");

  const extension = attachment.originalName.toLowerCase();
  if (
    (input.kind === "text-history" && !isPlainTextAttachment(attachment.originalName, attachment.mimeType)) ||
    (input.kind === "payment-history" && !extension.endsWith(".xlsx"))
  ) {
    throw new Error("El tipo de archivo no corresponde a esta acción.");
  }
  const settings = await getClinicSettings();
  const absolutePath = resolveLinkedAttachmentPath({
    patientsRootPath: settings.patientsRootPath,
    patientFolderRelativePath: attachment.patient.localFolderRelativePath,
    localRelativePath: attachment.localRelativePath
  });
  const fileStats = await stat(absolutePath);
  if (!fileStats.isFile()) throw new Error("El archivo vinculado ya no existe.");

  if (input.kind === "text-history") {
    if (!attachment.clinicalEntryId) {
      await linkTextAttachmentAsClinicalHistory({
        patientId: input.patientId,
        attachmentId: input.attachmentId
      });
    }
  } else if (!attachment.paymentHistorySheet) {
    await createPaymentHistorySheetForAttachment({
      patientId: input.patientId,
      attachmentId: input.attachmentId,
      googleFolderInput: attachment.patient.googleFolderId ?? undefined
    });
  }
  revalidatePath(`/patients/${input.patientId}`);
}
