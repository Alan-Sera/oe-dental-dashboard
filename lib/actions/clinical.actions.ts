"use server";

import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import {
  getTextHistoryBackupDir,
  getTextHistoryBlockBackupDir,
  resolveLinkedAttachmentPath,
} from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import {
  createDeletedTextHistoryBlockBackupFileName,
  createTextHistoryBackupFileName,
  detectPreferredLineEnding,
  isPlainTextAttachment,
  normalizeLineEndings,
  stripByteOrderMark,
} from "@/lib/text-attachments";
import {
  clinicalEntrySchema,
  linkedTextClinicalHistorySchema,
  type ClinicalEntryInput,
  type LinkedTextClinicalHistoryInput,
} from "@/lib/validation";

export async function createClinicalEntry(input: ClinicalEntryInput) {
  const parsed = clinicalEntrySchema.parse(input);

  const entry = await prisma.clinicalEntry.create({
    data: {
      patientId: parsed.patientId,
      entryDate: new Date(parsed.entryDate),
      tooth: parsed.tooth || null,
      diagnosis: parsed.diagnosis || null,
      treatment: parsed.treatment || null,
      notes: parsed.notes,
    },
  });

  await recordAudit("clinical_entry.created", "ClinicalEntry", entry.id, {
    patientId: parsed.patientId,
  });
  revalidatePath(`/patients/${parsed.patientId}`);
  revalidatePath("/dashboard");

  return entry;
}

export async function attachClinicalFile(
  clinicalEntryId: string,
  attachmentId: string,
) {
  const attachment = await prisma.attachment.update({
    where: { id: attachmentId },
    data: { clinicalEntryId },
  });

  await recordAudit(
    "clinical_entry.file_attached",
    "Attachment",
    attachmentId,
    {
      clinicalEntryId,
    },
  );
  revalidatePath(`/patients/${attachment.patientId}`);

  return attachment;
}

export async function linkTextAttachmentAsClinicalHistory(input: {
  patientId: string;
  attachmentId: string;
}) {
  if (!input.patientId || !input.attachmentId) {
    throw new Error("Archivo clínico inválido");
  }

  const attachment = await prisma.attachment.findFirst({
    where: {
      id: input.attachmentId,
      patientId: input.patientId,
    },
    include: {
      patient: {
        select: {
          localFolderRelativePath: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new Error("Archivo no encontrado");
  }

  if (!isPlainTextAttachment(attachment.originalName, attachment.mimeType)) {
    throw new Error("Solo se pueden vincular archivos .txt como historia");
  }

  if (attachment.clinicalEntryId) {
    return prisma.clinicalEntry.findUnique({
      where: { id: attachment.clinicalEntryId },
    });
  }

  const settings = await getClinicSettings();
  if (!settings.patientsRootPath) {
    throw new Error("Configura la carpeta maestra de pacientes");
  }

  const absolutePath = resolveLinkedAttachmentPath({
    patientsRootPath: settings.patientsRootPath,
    patientFolderRelativePath: attachment.patient.localFolderRelativePath,
    localRelativePath: attachment.localRelativePath,
  });
  const fileStats = await stat(absolutePath);

  if (!fileStats.isFile()) {
    throw new Error("El archivo de historia ya no existe en la ruta vinculada");
  }

  const notes = stripByteOrderMark(await readFile(absolutePath, "utf8"));
  const backupDir = getTextHistoryBackupDir();
  await mkdir(backupDir, { recursive: true });

  const backupFileName = createTextHistoryBackupFileName({
    timestamp: new Date(),
    patientId: attachment.patientId,
    attachmentId: attachment.id,
    originalName: attachment.originalName,
  });
  await copyFile(absolutePath, path.join(backupDir, backupFileName));

  const entry = await prisma.$transaction(async (tx) => {
    const clinicalEntry = await tx.clinicalEntry.create({
      data: {
        patientId: attachment.patientId,
        entryDate: new Date(),
        notes: notes.length
          ? notes
          : `Archivo .txt vacío: ${attachment.originalName}`,
      },
    });

    await tx.attachment.update({
      where: { id: attachment.id },
      data: {
        category: "CLINICAL_HISTORY",
        clinicalEntryId: clinicalEntry.id,
      },
    });

    return clinicalEntry;
  });

  await recordAudit(
    "clinical_entry.text_file_linked",
    "ClinicalEntry",
    entry.id,
    {
      patientId: attachment.patientId,
      attachmentId: attachment.id,
      originalName: attachment.originalName,
      backupFileName,
    },
  );
  revalidatePath(`/patients/${attachment.patientId}`);
  revalidatePath("/dashboard");

  return entry;
}

export async function updateLinkedTextClinicalHistory(
  input: LinkedTextClinicalHistoryInput,
) {
  const parsed = linkedTextClinicalHistorySchema.parse(input);
  const entry = await prisma.clinicalEntry.findFirst({
    where: {
      id: parsed.clinicalEntryId,
      patientId: parsed.patientId,
    },
    include: {
      patient: {
        select: {
          localFolderRelativePath: true,
        },
      },
      attachments: {
        orderBy: { importedAt: "desc" },
      },
    },
  });

  if (!entry) {
    throw new Error("Historia no encontrada");
  }

  const textAttachment = entry.attachments.find((attachment) =>
    isPlainTextAttachment(attachment.originalName, attachment.mimeType),
  );

  if (!textAttachment) {
    throw new Error("Esta historia no tiene un archivo .txt vinculado");
  }

  const settings = await getClinicSettings();
  if (!settings.patientsRootPath) {
    throw new Error("Configura la carpeta maestra de pacientes");
  }

  const absolutePath = resolveLinkedAttachmentPath({
    patientsRootPath: settings.patientsRootPath,
    patientFolderRelativePath: entry.patient.localFolderRelativePath,
    localRelativePath: textAttachment.localRelativePath,
  });
  const fileStats = await stat(absolutePath);

  if (!fileStats.isFile()) {
    throw new Error("El archivo de historia ya no existe en la ruta vinculada");
  }

  let deletedBlockBackupFileName: string | null = null;

  if (parsed.deletedBlockBackup) {
    const blockBackupDir = getTextHistoryBlockBackupDir();
    await mkdir(blockBackupDir, { recursive: true });

    deletedBlockBackupFileName = createDeletedTextHistoryBlockBackupFileName({
      timestamp: new Date(),
      patientId: entry.patientId,
      attachmentId: textAttachment.id,
      blockType: parsed.deletedBlockBackup.type,
      label: parsed.deletedBlockBackup.label,
    });
    await writeFile(
      path.join(blockBackupDir, deletedBlockBackupFileName),
      parsed.deletedBlockBackup.content,
      "utf8",
    );
  }

  const nextFileContent = normalizeLineEndings(
    parsed.notes,
    detectPreferredLineEnding(entry.notes),
  );
  await writeFile(absolutePath, nextFileContent, "utf8");

  const updatedEntry = await prisma.clinicalEntry.update({
    where: { id: entry.id },
    data: { notes: nextFileContent },
  });

  await recordAudit(
    "clinical_entry.text_file_updated",
    "ClinicalEntry",
    entry.id,
    {
      patientId: entry.patientId,
      attachmentId: textAttachment.id,
      deletedBlockBackupFileName,
    },
  );
  revalidatePath(`/patients/${entry.patientId}`);
  revalidatePath("/dashboard");

  return updatedEntry;
}
