"use server";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { AttachmentCategory, ImportItemStatus } from "@prisma/client";

import { recordAudit } from "@/lib/actions/audit.actions";
import { createPaymentHistorySheetForAttachment } from "@/lib/actions/payment-history.actions";
import { linkTextAttachmentAsClinicalHistory } from "@/lib/actions/clinical.actions";
import {
  classifyImportCandidate,
  extractPatientName,
  type AttachmentCategoryValue
} from "@/lib/import-classifier";
import { extractImageCapturedAt } from "@/lib/image-capture-date";
import {
  joinStoredRelativePath,
  normalizePatientsRootPath,
  normalizeStoredRelativePath
} from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import { importPatientsRootSchema } from "@/lib/validation";
import { extractGoogleDriveFolderId } from "@/lib/google-drive";

type ScannedFile = {
  fileName: string;
  localRelativePath: string;
  sizeBytes: number;
  mimeType: string;
  capturedAt: Date | null;
};

export async function importPatientsRoot(input: unknown) {
  const parsed = importPatientsRootSchema.parse(input);
  const patientsRootPath = normalizePatientsRootPath(parsed.patientsRootPath);
  const rootStats = await stat(patientsRootPath);

  if (!rootStats.isDirectory()) {
    throw new Error("La carpeta maestra no existe o no es una carpeta");
  }

  if (parsed.resetExistingData) {
    await resetPatientData();
  }

  await prisma.setting.upsert({
    where: { key: "files.patientsRootPath" },
    create: { key: "files.patientsRootPath", value: patientsRootPath },
    update: { value: patientsRootPath }
  });

  const patientDriveLinkMap = new Map<string, string>();
  if (parsed.patientsDriveLinks) {
    try {
      const jsonData = JSON.parse(parsed.patientsDriveLinks);
      for (const item of jsonData.carpetas ?? []) {
        if (item.carpeta_creada && item.link_para_compartir) {
          patientDriveLinkMap.set(item.carpeta_creada, item.link_para_compartir);
        }
      }
    } catch {
      // JSON inválido, continuar con el googleFolderId global
    }
  }

  const sourceRootName = path.basename(patientsRootPath) || patientsRootPath;
  const batch = await prisma.importBatch.create({
    data: {
      sourceRootName,
      status: "PREVIEW"
    }
  });

  let fileCount = 0;
  let importedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  const clinicalHistoryAttachments: { patientId: string; attachmentId: string }[] = [];

  try {
    const patientDirectories = (await readdir(patientsRootPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !shouldSkipDirectory(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    for (const directory of patientDirectories) {
      const localFolderRelativePath = normalizeStoredRelativePath(directory.name);
      const patientName = extractPatientName(localFolderRelativePath);
      const patient = await findOrCreateLinkedPatient(patientName, localFolderRelativePath);
      const scannedFiles = await scanPatientFiles(path.join(patientsRootPath, directory.name));

      for (const file of scannedFiles) {
        fileCount += 1;

        const sourceRelativePath = joinStoredRelativePath(
          localFolderRelativePath,
          file.localRelativePath
        );
        const classified = classifyImportCandidate({
          relativePath: sourceRelativePath,
          fileName: file.fileName,
          mimeType: file.mimeType
        });
        let category = classified.category as AttachmentCategoryValue;
        if (
          file.fileName.toLowerCase().endsWith(".txt") &&
          category !== "CLINICAL_HISTORY"
        ) {
          category = "CLINICAL_HISTORY";
        }
        if (
          file.fileName.toLowerCase().endsWith(".xlsx") &&
          category !== "PAYMENT_HISTORY"
        ) {
          category = "PAYMENT_HISTORY";
        }
        const existingAttachment = await prisma.attachment.findUnique({
          where: {
            patientId_localRelativePath: {
              patientId: patient.id,
              localRelativePath: file.localRelativePath
            }
          }
        });

        if (existingAttachment) {
          duplicateCount += 1;
          const attachment = await prisma.attachment.update({
            where: { id: existingAttachment.id },
            data: {
              category: category as AttachmentCategory,
              originalName: file.fileName,
              mimeType: file.mimeType || null,
              sizeBytes: file.sizeBytes,
              capturedAt: file.capturedAt ?? existingAttachment.capturedAt,
              sourceRelativePath,
              importBatchId: batch.id
            }
          });

          await createImportItem({
            batchId: batch.id,
            candidateId: sourceRelativePath,
            patientName: patient.fullName,
            category,
            file,
            sourceRelativePath,
            status: ImportItemStatus.DUPLICATE,
            attachmentId: attachment.id,
            message: "Archivo ya vinculado por ruta local"
          });

          if (category === "PAYMENT_HISTORY") {
            const driveLink = patientDriveLinkMap.get(patientName) ?? parsed.googleFolderId;
            await ensurePaymentHistorySheet({
              patientId: patient.id,
              attachmentId: attachment.id,
              googleFolderInput: driveLink
            });
          }

          if (category === "CLINICAL_HISTORY") {
            clinicalHistoryAttachments.push({ patientId: patient.id, attachmentId: attachment.id });
          }

          continue;
        }

        const attachment = await prisma.attachment.create({
          data: {
            patientId: patient.id,
            category: category as AttachmentCategory,
            originalName: file.fileName,
            localRelativePath: file.localRelativePath,
            mimeType: file.mimeType || null,
            sizeBytes: file.sizeBytes,
            capturedAt: file.capturedAt,
            sourceRelativePath,
            importBatchId: batch.id
          }
        });

        importedCount += 1;

        if (category === "CLINICAL_HISTORY") {
          clinicalHistoryAttachments.push({ patientId: patient.id, attachmentId: attachment.id });
        }

        if (category === "PAYMENT_HISTORY") {
          const driveLink = patientDriveLinkMap.get(patientName) ?? parsed.googleFolderId;
          await createPaymentHistorySheetForAttachment({
            patientId: patient.id,
            attachmentId: attachment.id,
            googleFolderInput: driveLink
          });
        }

        await createImportItem({
          batchId: batch.id,
          candidateId: sourceRelativePath,
          patientName: patient.fullName,
          category,
          file,
          sourceRelativePath,
          status: ImportItemStatus.IMPORTED,
          attachmentId: attachment.id
        });
      }
    }

    for (const { patientId, attachmentId } of clinicalHistoryAttachments) {
      try {
        await linkTextAttachmentAsClinicalHistory({ patientId, attachmentId });
      } catch (linkingError) {
        console.error(
          `No se pudo vincular historia clínica para attachment ${attachmentId}:`,
          linkingError instanceof Error ? linkingError.message : linkingError
        );
      }
    }

    const committedBatch = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: errorCount > 0 ? "FAILED" : "COMMITTED",
        fileCount,
        importedCount,
        duplicateCount,
        errorCount,
        committedAt: new Date()
      }
    });

    await recordAudit("import_batch.linked_local_folder", "ImportBatch", batch.id, {
      patientsRootPath,
      fileCount,
      importedCount,
      duplicateCount,
      errorCount
    });
    revalidatePath("/import");
    revalidatePath("/patients");
    revalidatePath("/dashboard");
    revalidatePath("/settings");

    return committedBatch;
  } catch (error) {
    errorCount += 1;
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        fileCount,
        importedCount,
        duplicateCount,
        errorCount,
        committedAt: new Date()
      }
    });

    await recordAudit("import_batch.failed", "ImportBatch", batch.id, {
      message: error instanceof Error ? error.message : "No se pudo vincular la carpeta local"
    });
    throw error;
  }
}

export async function getRecentImportBatches() {
  return prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      items: true
    }
  });
}

export async function getImportBatch(batchId: string) {
  return prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { items: true }
  });
}

export async function commitImportBatch(batchId: string) {
  const items = await prisma.importItem.findMany({
    where: { batchId }
  });

  const importedCount = items.filter((item) => item.status === "IMPORTED").length;
  const duplicateCount = items.filter((item) => item.status === "DUPLICATE").length;
  const errorCount = items.filter((item) => item.status === "FAILED").length;

  const batch = await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: errorCount > 0 ? "FAILED" : "COMMITTED",
      importedCount,
      duplicateCount,
      errorCount,
      committedAt: new Date()
    },
    include: { items: true }
  });

  await recordAudit("import_batch.committed", "ImportBatch", batchId, {
    importedCount,
    duplicateCount,
    errorCount
  });
  revalidatePath("/import");
  revalidatePath("/patients");
  revalidatePath("/dashboard");

  return batch;
}

async function findOrCreateLinkedPatient(patientName: string, localFolderRelativePath: string) {
  const existingByFolder = await prisma.patient.findUnique({
    where: { localFolderRelativePath }
  });

  if (existingByFolder) {
    return existingByFolder;
  }

  const existingByName = await prisma.patient.findFirst({
    where: {
      fullName: {
        equals: patientName
      }
    }
  });

  if (existingByName) {
    return prisma.patient.update({
      where: { id: existingByName.id },
      data: {
        localFolderRelativePath,
        folderAliases: JSON.stringify([patientName, localFolderRelativePath])
      }
    });
  }

  const patient = await prisma.patient.create({
    data: {
      fullName: patientName,
      localFolderRelativePath,
      folderAliases: JSON.stringify([patientName, localFolderRelativePath])
    }
  });

  await recordAudit("patient.created_from_local_folder", "Patient", patient.id, {
    patientName,
    localFolderRelativePath
  });

  return patient;
}

async function scanPatientFiles(patientFolderPath: string) {
  const files: ScannedFile[] = [];

  await scanDirectory(patientFolderPath, "", files);

  return files;
}

async function scanDirectory(rootPath: string, relativeDirectory: string, files: ScannedFile[]) {
  const absoluteDirectory = relativeDirectory
    ? path.join(rootPath, ...relativeDirectory.split("/"))
    : rootPath;
  const entries = (await readdir(absoluteDirectory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue;

      await scanDirectory(rootPath, joinStoredRelativePath(relativeDirectory, entry.name), files);
      continue;
    }

    if (!entry.isFile() || shouldSkipFile(entry.name)) continue;

    const localRelativePath = normalizeStoredRelativePath(
      joinStoredRelativePath(relativeDirectory, entry.name)
    );
    const absolutePath = path.join(rootPath, ...localRelativePath.split("/"));
    const fileStats = await stat(absolutePath);
    const mimeType = guessMimeType(entry.name);
    const capturedAt = await extractImageCapturedAt(absolutePath, entry.name, mimeType);

    files.push({
      fileName: entry.name,
      localRelativePath,
      sizeBytes: fileStats.size,
      mimeType,
      capturedAt
    });
  }
}

async function createImportItem({
  batchId,
  candidateId,
  patientName,
  category,
  file,
  sourceRelativePath,
  status,
  attachmentId,
  message
}: {
  batchId: string;
  candidateId: string;
  patientName: string;
  category: AttachmentCategoryValue;
  file: ScannedFile;
  sourceRelativePath: string;
  status: ImportItemStatus;
  attachmentId: string;
  message?: string;
}) {
  await prisma.importItem.create({
    data: {
      batchId,
      candidateId,
      patientName,
      category: category as AttachmentCategory,
      originalName: file.fileName,
      localRelativePath: file.localRelativePath,
      sourceRelativePath,
      sizeBytes: file.sizeBytes,
      status,
      attachmentId,
      message: message ?? null
    }
  });
}

async function ensurePaymentHistorySheet({
  patientId,
  attachmentId,
  googleFolderInput
}: {
  patientId: string;
  attachmentId: string;
  googleFolderInput?: string;
}) {
  const existing = await prisma.paymentHistorySheet.findUnique({
    where: { attachmentId }
  });

  if (existing) {
    const desiredFolderId = extractGoogleDriveFolderId(googleFolderInput ?? "");
    if (desiredFolderId && existing.googleFolderId !== desiredFolderId) {
      await prisma.paymentHistorySheet.update({
        where: { id: existing.id },
        data: { googleFolderId: desiredFolderId }
      });
    }
    return existing;
  }

  return createPaymentHistorySheetForAttachment({
    patientId,
    attachmentId,
    googleFolderInput
  });
}

async function resetPatientData() {
  await prisma.$transaction([
    prisma.paymentHistorySheet.deleteMany(),
    prisma.importItem.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.clinicalEntry.deleteMany(),
    prisma.treatmentCharge.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.patient.deleteMany()
  ]);
}

function shouldSkipDirectory(name: string) {
  return name.startsWith(".") || name === "__MACOSX" || name.toLowerCase() === "node_modules";
}

function shouldSkipFile(name: string) {
  const normalized = name.toLowerCase();
  return (
    normalized === ".ds_store" ||
    normalized === "thumbs.db" ||
    normalized === "desktop.ini" ||
    normalized.startsWith("~$")
  );
}

function guessMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain"
  };

  return mimeTypes[extension] ?? "application/octet-stream";
}
