import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { AttachmentCategory } from "@prisma/client";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { findOrCreatePatientByName } from "@/lib/actions/patient.actions";
import { requireSession } from "@/lib/auth";
import type { AttachmentCategoryValue } from "@/lib/import-classifier";
import {
  buildVaultRelativePath,
  ensureDataDirectories,
  resolveVaultPath
} from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import { parseMoneyToCents } from "@/lib/utils";
import { importCandidateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  await requireSession();
  await ensureDataDirectories();

  const { batchId } = await params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const parsed = importCandidateSchema.parse({
    candidateId: String(formData.get("candidateId") ?? ""),
    patientName: String(formData.get("patientName") ?? ""),
    category: String(formData.get("category") ?? ""),
    originalName: String(formData.get("originalName") ?? file.name),
    sourceRelativePath: String(formData.get("sourceRelativePath") ?? file.name),
    sha256: String(formData.get("sha256") ?? ""),
    sizeBytes: Number(formData.get("sizeBytes") ?? file.size),
    mimeType: String(formData.get("mimeType") ?? file.type ?? ""),
    paymentAmount: String(formData.get("paymentAmount") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
    paymentDate: String(formData.get("paymentDate") ?? "")
  });

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId }
  });

  if (!batch) {
    return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
  }

  const existingAttachment = await prisma.attachment.findUnique({
    where: { sha256: parsed.sha256 }
  });

  if (existingAttachment) {
    await prisma.importItem.update({
      where: {
        batchId_candidateId: {
          batchId,
          candidateId: parsed.candidateId
        }
      },
      data: {
        status: "DUPLICATE",
        attachmentId: existingAttachment.id,
        message: "Archivo duplicado por hash"
      }
    });

    return NextResponse.json({
      status: "DUPLICATE",
      attachmentId: existingAttachment.id
    });
  }

  const patient = await findOrCreatePatientByName(parsed.patientName);
  const category = parsed.category as AttachmentCategoryValue;
  const vaultRelativePath = buildVaultRelativePath({
    patientId: patient.id,
    category,
    sha256: parsed.sha256,
    originalName: parsed.originalName
  });
  const vaultAbsolutePath = resolveVaultPath(vaultRelativePath);

  await mkdir(path.dirname(vaultAbsolutePath), { recursive: true });
  await writeFile(vaultAbsolutePath, Buffer.from(await file.arrayBuffer()));

  let attachment = await prisma.attachment.create({
    data: {
      patientId: patient.id,
      category: parsed.category as AttachmentCategory,
      originalName: parsed.originalName,
      vaultPath: vaultRelativePath,
      mimeType: parsed.mimeType || file.type || null,
      sizeBytes: parsed.sizeBytes,
      sha256: parsed.sha256,
      sourceRelativePath: parsed.sourceRelativePath,
      importBatchId: batchId
    }
  });

  if (category === "CLINICAL_HISTORY") {
    const entry = await prisma.clinicalEntry.create({
      data: {
        patientId: patient.id,
        entryDate: new Date(),
        notes: `Documento clínico importado: ${parsed.originalName}`,
        attachments: {
          connect: { id: attachment.id }
        }
      }
    });

    attachment = await prisma.attachment.update({
      where: { id: attachment.id },
      data: { clinicalEntryId: entry.id }
    });
  }

  if (category === "PAYMENT_RECEIPT" && parsed.paymentAmount) {
    const amountCents = parseMoneyToCents(parsed.paymentAmount);

    if (amountCents > 0) {
      const settings = await getClinicSettings();
      const payment = await prisma.payment.create({
        data: {
          patientId: patient.id,
          amountCents,
          currency: settings.currency,
          paidAt: parsed.paymentDate ? new Date(parsed.paymentDate) : new Date(),
          method: parsed.paymentMethod || "No especificado",
          status: "CONFIRMED",
          attachments: {
            connect: { id: attachment.id }
          }
        }
      });

      attachment = await prisma.attachment.update({
        where: { id: attachment.id },
        data: { paymentId: payment.id }
      });
    }
  }

  await prisma.importItem.update({
    where: {
      batchId_candidateId: {
        batchId,
        candidateId: parsed.candidateId
      }
    },
    data: {
      status: "IMPORTED",
      attachmentId: attachment.id,
      message: null
    }
  });

  await recordAudit("import_file.imported", "Attachment", attachment.id, {
    batchId,
    patientId: patient.id,
    sourceRelativePath: parsed.sourceRelativePath
  });

  return NextResponse.json({
    status: "IMPORTED",
    attachmentId: attachment.id,
    patientId: patient.id
  });
}
