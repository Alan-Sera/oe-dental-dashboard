"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { prisma } from "@/lib/prisma";
import { clinicalEntrySchema, type ClinicalEntryInput } from "@/lib/validation";

export async function createClinicalEntry(input: ClinicalEntryInput) {
  const parsed = clinicalEntrySchema.parse(input);

  const entry = await prisma.clinicalEntry.create({
    data: {
      patientId: parsed.patientId,
      entryDate: new Date(parsed.entryDate),
      tooth: parsed.tooth || null,
      diagnosis: parsed.diagnosis || null,
      treatment: parsed.treatment || null,
      notes: parsed.notes
    }
  });

  await recordAudit("clinical_entry.created", "ClinicalEntry", entry.id, {
    patientId: parsed.patientId
  });
  revalidatePath(`/patients/${parsed.patientId}`);
  revalidatePath("/dashboard");

  return entry;
}

export async function attachClinicalFile(clinicalEntryId: string, attachmentId: string) {
  const attachment = await prisma.attachment.update({
    where: { id: attachmentId },
    data: { clinicalEntryId }
  });

  await recordAudit("clinical_entry.file_attached", "Attachment", attachmentId, {
    clinicalEntryId
  });
  revalidatePath(`/patients/${attachment.patientId}`);

  return attachment;
}
