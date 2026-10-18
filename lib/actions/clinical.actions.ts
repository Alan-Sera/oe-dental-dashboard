"use server";

import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { requireSession } from "@/lib/auth";
import {
  getTextHistoryBackupDir,
  getTextHistoryBlockBackupDir,
  resolveLinkedAttachmentPath,
} from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import {
  createDeletedTextHistoryBlockBackupFileName,
  createTextHistoryBackupFileName,
  clinicalNotesFromTextFile,
  detectPreferredLineEnding,
  isPlainTextAttachment,
  linkedTextMatchesClinicalNotes,
  normalizeLineEndings,
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
  await requireSession();
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

  const notes = clinicalNotesFromTextFile(await readFile(absolutePath, "utf8"), attachment.originalName);
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
        notes,
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
  await requireSession();
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
  if (entry.updatedAt.toISOString() !== parsed.expectedEntryUpdatedAt) {
    throw new Error("La historia cambió en otra sesión. Actualiza el expediente antes de guardarla.");
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

  const currentContent = await readFile(absolutePath, "utf8");
  if (!linkedTextMatchesClinicalNotes(currentContent, entry.notes, textAttachment.originalName)) {
    throw new Error("El archivo cambió fuera de la app. Resuelve el conflicto antes de editar esta historia.");
  }

  const backupFileName = await backupTextFile({
    absolutePath,
    patientId: entry.patientId,
    attachmentId: textAttachment.id,
    originalName: textAttachment.originalName
  });
  const backedUpContent = await readFile(path.join(getTextHistoryBackupDir(), backupFileName), "utf8");
  if (backedUpContent !== currentContent || await readFile(absolutePath, "utf8") !== currentContent) {
    throw new Error("El archivo cambió mientras se preparaba el guardado. Vuelve a abrir la historia.");
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
  await prisma.attachment.update({
    where: { id: textAttachment.id },
    data: { sourceModifiedAt: (await stat(absolutePath)).mtime, sizeBytes: Buffer.byteLength(nextFileContent, "utf8") }
  });

  await recordAudit(
    "clinical_entry.text_file_updated",
    "ClinicalEntry",
    entry.id,
    {
      patientId: entry.patientId,
      attachmentId: textAttachment.id,
      backupFileName,
      deletedBlockBackupFileName,
    },
  );
  revalidatePath(`/patients/${entry.patientId}`);
  revalidatePath("/dashboard");

  return updatedEntry;
}

export async function resolveLinkedTextClinicalConflict(input: {
  patientId: string;
  attachmentId: string;
  expectedSourceHash: string;
  expectedEntryUpdatedAt: string;
  resolution: "use-file" | "use-app";
}) {
  await requireSession();
  if (!/^[a-f0-9]{64}$/.test(input.expectedSourceHash) ||
      (input.resolution !== "use-file" && input.resolution !== "use-app")) {
    throw new Error("La resolución del conflicto no es válida.");
  }
  const attachment = await prisma.attachment.findFirst({
    where: { id: input.attachmentId, patientId: input.patientId },
    include: { patient: true, clinicalEntry: true }
  });
  if (!attachment?.clinicalEntry ||
      !isPlainTextAttachment(attachment.originalName, attachment.mimeType)) {
    throw new Error("No se encontró una historia clínica vinculada a este archivo.");
  }
  if (attachment.clinicalEntry.updatedAt.toISOString() !== input.expectedEntryUpdatedAt) {
    throw new Error("La historia cambió en otra sesión. Actualiza el expediente antes de resolver el conflicto.");
  }
  const settings = await getClinicSettings();
  const absolutePath = resolveLinkedAttachmentPath({
    patientsRootPath: settings.patientsRootPath,
    patientFolderRelativePath: attachment.patient.localFolderRelativePath,
    localRelativePath: attachment.localRelativePath
  });
  const currentContent = await readFile(absolutePath, "utf8");
  if (createHash("sha256").update(currentContent).digest("hex") !== input.expectedSourceHash ||
      linkedTextMatchesClinicalNotes(currentContent, attachment.clinicalEntry.notes, attachment.originalName)) {
    throw new Error("El archivo volvió a cambiar. Actualiza el expediente antes de resolver el conflicto.");
  }
  const backupFileName = await backupTextFile({
    absolutePath,
    patientId: input.patientId,
    attachmentId: attachment.id,
    originalName: attachment.originalName
  });
  const backupContent = await readFile(path.join(getTextHistoryBackupDir(), backupFileName), "utf8");
  if (backupContent !== currentContent || await readFile(absolutePath, "utf8") !== currentContent) {
    throw new Error("El archivo cambió mientras se creaba el respaldo. Actualiza el expediente.");
  }

  if (input.resolution === "use-file") {
    const previousEntry = attachment.clinicalEntry;
    const notes = clinicalNotesFromTextFile(currentContent, attachment.originalName);
    const sourceStats = await stat(absolutePath);
    const nextEntry = await prisma.$transaction(async (tx) => {
      const created = await tx.clinicalEntry.create({
        data: {
          patientId: input.patientId,
          entryDate: new Date(),
          tooth: previousEntry.tooth,
          diagnosis: previousEntry.diagnosis,
          treatment: previousEntry.treatment,
          notes
        }
      });
      await tx.attachment.update({
        where: { id: attachment.id },
        data: { clinicalEntryId: created.id, sourceModifiedAt: sourceStats.mtime,
          sizeBytes: Buffer.byteLength(currentContent, "utf8") }
      });
      await tx.auditLog.create({
        data: {
          event: "clinical_entry.external_file_imported",
          entity: "ClinicalEntry",
          entityId: created.id,
          metadata: JSON.stringify({ patientId: input.patientId, attachmentId: attachment.id,
            previousEntryId: previousEntry.id, backupFileName })
        }
      });
      return created;
    });
    revalidatePath(`/patients/${input.patientId}`);
    revalidatePath("/dashboard");
    return { entryId: nextEntry.id, backupFileName };
  }

  await writeFile(absolutePath, attachment.clinicalEntry.notes, "utf8");
  try {
    const restoredStats = await stat(absolutePath);
    await prisma.$transaction([
      prisma.attachment.update({ where: { id: attachment.id }, data: {
        sourceModifiedAt: restoredStats.mtime, sizeBytes: restoredStats.size
      } }),
      prisma.auditLog.create({ data: {
        event: "clinical_entry.external_file_replaced",
        entity: "ClinicalEntry",
        entityId: attachment.clinicalEntry.id,
        metadata: JSON.stringify({ patientId: input.patientId, attachmentId: attachment.id, backupFileName })
      } })
    ]);
  } catch (error) {
    if (await readFile(absolutePath, "utf8") === attachment.clinicalEntry.notes) {
      await copyFile(path.join(getTextHistoryBackupDir(), backupFileName), absolutePath);
    }
    throw error;
  }
  revalidatePath(`/patients/${input.patientId}`);
  return { entryId: attachment.clinicalEntry.id, backupFileName };
}

async function backupTextFile(input: {
  absolutePath: string;
  patientId: string;
  attachmentId: string;
  originalName: string;
}) {
  const backupDir = getTextHistoryBackupDir();
  await mkdir(backupDir, { recursive: true });
  const backupFileName = `${createTextHistoryBackupFileName({
    timestamp: new Date(),
    patientId: input.patientId,
    attachmentId: input.attachmentId,
    originalName: input.originalName.slice(0, 40)
  })}_${randomBytes(8).toString("hex")}`;
  await copyFile(input.absolutePath, path.join(backupDir, backupFileName));
  return backupFileName;
}
