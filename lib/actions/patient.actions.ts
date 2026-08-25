"use server";

import { stat } from "node:fs/promises";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import {
  canReadImageCaptureMetadata,
  extractImageCapturedAt
} from "@/lib/image-capture-date";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import { patientSchema, type PatientInput } from "@/lib/validation";

type PatientWithTopLevelAttachments = {
  localFolderRelativePath: string | null;
  attachments: Array<{
    id: string;
    originalName: string;
    localRelativePath: string;
    mimeType: string | null;
    capturedAt: Date | null;
  }>;
};

export async function createPatient(input: PatientInput) {
  const parsed = patientSchema.parse(input);

  const patient = await prisma.patient.create({
    data: {
      fullName: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      birthDate: inputDateToUtcNoon(parsed.birthDate),
      gender: parsed.gender || null,
      nextAppointmentDate: inputDateToUtcNoon(parsed.nextAppointmentDate),
      notes: parsed.notes || null,
      folderAliases: JSON.stringify([parsed.fullName])
    }
  });

  await recordAudit("patient.created", "Patient", patient.id, { fullName: patient.fullName });
  revalidatePath("/patients");
  revalidatePath("/dashboard");

  return patient;
}

export async function updatePatient(patientId: string, input: PatientInput) {
  const parsed = patientSchema.parse(input);

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      fullName: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      birthDate: inputDateToUtcNoon(parsed.birthDate),
      gender: parsed.gender || null,
      nextAppointmentDate: inputDateToUtcNoon(parsed.nextAppointmentDate),
      notes: parsed.notes || null
    }
  });

  await recordAudit("patient.updated", "Patient", patient.id);
  revalidatePath("/patients");
  revalidatePath(`/patients/${patient.id}`);

  return patient;
}

export async function getPatients() {
  return prisma.patient.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      attachments: true,
      clinicalEntries: true,
      charges: true,
      payments: true,
      paymentHistorySheets: {
        include: { attachment: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

export async function getPatientById(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      attachments: {
        orderBy: { importedAt: "desc" }
      },
      clinicalEntries: {
        include: { attachments: true },
        orderBy: { entryDate: "desc" }
      },
      charges: {
        include: { attachments: true },
        orderBy: { serviceDate: "desc" }
      },
      payments: {
        include: { attachments: true },
        orderBy: { paidAt: "desc" }
      },
      paymentHistorySheets: {
        include: { attachment: true },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
      }
    }
  });

  if (patient) {
    await populateMissingAttachmentCaptureDates(patient);
  }

  return patient;
}

export async function findOrCreatePatientByName(patientName: string) {
  const existing = await prisma.patient.findFirst({
    where: {
      fullName: {
        equals: patientName
      }
    }
  });

  if (existing) {
    return existing;
  }

  const patient = await prisma.patient.create({
    data: {
      fullName: patientName,
      folderAliases: JSON.stringify([patientName])
    }
  });

  await recordAudit("patient.created_from_import", "Patient", patient.id, { patientName });
  return patient;
}

function inputDateToUtcNoon(value: string | undefined) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

async function populateMissingAttachmentCaptureDates(patient: PatientWithTopLevelAttachments) {
  const pendingAttachments = patient.attachments.filter(
    (attachment) =>
      !attachment.capturedAt &&
      canReadImageCaptureMetadata(attachment.originalName, attachment.mimeType)
  );

  if (!pendingAttachments.length) return;

  const settings = await getClinicSettings();
  if (!settings.patientsRootPath) return;

  for (const attachment of pendingAttachments) {
    try {
      const absolutePath = resolveLinkedAttachmentPath({
        patientsRootPath: settings.patientsRootPath,
        patientFolderRelativePath: patient.localFolderRelativePath,
        localRelativePath: attachment.localRelativePath
      });
      const fileStats = await stat(absolutePath);
      if (!fileStats.isFile()) continue;

      const capturedAt = await extractImageCapturedAt(
        absolutePath,
        attachment.originalName,
        attachment.mimeType
      );
      if (!capturedAt) continue;

      await prisma.attachment.update({
        where: { id: attachment.id },
        data: { capturedAt }
      });
      attachment.capturedAt = capturedAt;
    } catch {
      // Missing or unreadable linked files are handled elsewhere in the patient view.
    }
  }
}
