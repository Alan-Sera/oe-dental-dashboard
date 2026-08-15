"use server";

import { ImportItemStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { prisma } from "@/lib/prisma";
import { createImportBatchSchema } from "@/lib/validation";

export async function createImportBatch(input: unknown) {
  const parsed = createImportBatchSchema.parse(input);

  const batch = await prisma.importBatch.create({
    data: {
      sourceRootName: parsed.sourceRootName,
      fileCount: parsed.items.length,
      items: {
        create: parsed.items.map((item) => ({
          candidateId: item.candidateId,
          patientName: item.patientName,
          category: item.category,
          originalName: item.originalName,
          sourceRelativePath: item.sourceRelativePath,
          sha256: item.sha256,
          sizeBytes: item.sizeBytes,
          status: ImportItemStatus.READY
        }))
      }
    },
    include: { items: true }
  });

  await recordAudit("import_batch.created", "ImportBatch", batch.id, {
    fileCount: parsed.items.length
  });
  revalidatePath("/import");
  revalidatePath("/dashboard");

  return batch;
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
