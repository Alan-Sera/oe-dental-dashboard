"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { prisma } from "@/lib/prisma";
import { patientSchema, type PatientInput } from "@/lib/validation";

export async function createPatient(input: PatientInput) {
  const parsed = patientSchema.parse(input);

  const patient = await prisma.patient.create({
    data: {
      fullName: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      birthDate: parsed.birthDate ? new Date(parsed.birthDate) : null,
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
      birthDate: parsed.birthDate ? new Date(parsed.birthDate) : null,
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
      payments: true
    }
  });
}

export async function getPatientById(patientId: string) {
  return prisma.patient.findUnique({
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
      }
    }
  });
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
