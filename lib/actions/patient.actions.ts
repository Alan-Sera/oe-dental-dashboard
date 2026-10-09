"use server";

import { stat } from "node:fs/promises";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { requireSession } from "@/lib/auth";
import {
  canReadImageCaptureMetadata,
  extractImageCapturedAt
} from "@/lib/image-capture-date";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import { normalizePatientIdentity, normalizePhone, isProvisioningInProgress } from "@/lib/patient-provisioning";
import { prisma } from "@/lib/prisma";
import {
  PatientProvisioningAlreadyRunningError,
  PatientProvisioningPreflightError,
  inspectPatientProvisioningReadiness,
  preflightPatientProvisioning,
  provisionPatient
} from "@/lib/services/patient-provisioning";
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

export type CreatePatientResult =
  | {
      kind: "created";
      patientId: string;
      provisioningStatus: "READY" | "PARTIAL" | "FAILED";
      provisioningError: string | null;
      googleFolderUrl: string | null;
    }
  | {
      kind: "duplicates";
      candidates: Array<{
        id: string;
        fullName: string;
        phone: string | null;
        birthDate: string | null;
      }>;
    }
  | {
      kind: "error";
      code: "VALIDATION" | "LOCAL_ROOT_MISSING" | "LOCAL_ROOT_UNWRITABLE" | "TEMPLATE_MISSING" | "UNKNOWN";
      message: string;
      recoverable: boolean;
      patientId?: string;
    };

export async function getPatientProvisioningReadiness() {
  await requireSession();
  return inspectPatientProvisioningReadiness();
}

export async function createPatient(
  input: PatientInput,
  options?: { creationRequestId?: string; confirmedDuplicateIds?: string[] }
): Promise<CreatePatientResult> {
  await requireSession();
  const validation = patientSchema.safeParse(input);
  if (!validation.success) {
    return {
      kind: "error",
      code: "VALIDATION",
      message: validation.error.issues[0]?.message ?? "Revisa los datos del paciente.",
      recoverable: false
    };
  }
  const parsed = validation.data;

  if (options?.creationRequestId) {
    const existingRequest = await prisma.patient.findUnique({
      where: { creationRequestId: options.creationRequestId },
      select: {
        id: true,
        provisioningStatus: true,
        provisioningError: true,
        googleFolderUrl: true
      }
    });
    if (existingRequest) return toCreateResult(existingRequest);
  }

  const duplicates = await findDuplicatePatients(parsed);
  const confirmedIds = new Set(options?.confirmedDuplicateIds ?? []);
  if (duplicates.some((candidate) => !confirmedIds.has(candidate.id))) {
    return {
      kind: "duplicates",
      candidates: duplicates.map((candidate) => ({
        id: candidate.id,
        fullName: candidate.fullName,
        phone: candidate.phone,
        birthDate: candidate.birthDate?.toISOString().slice(0, 10) ?? null
      }))
    };
  }

  try {
    await preflightPatientProvisioning();
  } catch (error) {
    if (error instanceof PatientProvisioningPreflightError) {
      return {
        kind: "error",
        code: error.code,
        message: error.message,
        recoverable: false
      };
    }
    return {
      kind: "error",
      code: "UNKNOWN",
      message: "No se pudo validar la preparación del expediente.",
      recoverable: false
    };
  }

  let patient;
  try {
    patient = await prisma.patient.create({
      data: {
        fullName: parsed.fullName,
        email: parsed.email || null,
        phone: parsed.phoneUnavailable ? null : normalizePhone(parsed.phone) || null,
        phoneUnavailable: parsed.phoneUnavailable,
        birthDate: inputDateToUtcNoon(parsed.birthDate),
        gender: parsed.gender || null,
        notes: parsed.notes || null,
        folderAliases: JSON.stringify([parsed.fullName]),
        provisioningStatus: "PENDING",
        creationRequestId: options?.creationRequestId || null
      }
    });
  } catch (error) {
    if (options?.creationRequestId && isUniqueConstraintError(error)) {
      const existingRequest = await prisma.patient.findUnique({
        where: { creationRequestId: options.creationRequestId },
        select: {
          id: true,
          provisioningStatus: true,
          provisioningError: true,
          googleFolderUrl: true
        }
      });
      if (existingRequest) return toCreateResult(existingRequest);
    }
    throw error;
  }

  await recordAudit("patient.created", "Patient", patient.id);
  let provisioned: Awaited<ReturnType<typeof provisionPatient>>;
  try {
    provisioned = await provisionPatient(patient.id);
  } catch (error) {
    if (error instanceof PatientProvisioningAlreadyRunningError) {
      return {
        kind: "error",
        code: "UNKNOWN",
        message: error.message,
        recoverable: true,
        patientId: patient.id
      };
    }
    throw error;
  }
  revalidatePath("/patients");
  revalidatePath("/dashboard");
  revalidatePath(`/patients/${patient.id}`);

  return toCreateResult(provisioned);
}

export async function retryPatientProvisioning(patientId: string): Promise<CreatePatientResult> {
  await requireSession();
  if (!patientId) {
    return { kind: "error", code: "VALIDATION", message: "Paciente inválido.", recoverable: false };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { provisioningStatus: true, provisioningStartedAt: true, createdAt: true }
  });
  if (!patient) {
    return { kind: "error", code: "VALIDATION", message: "Paciente no encontrado.", recoverable: false };
  }
  if (patient.provisioningStatus === "UNMANAGED") {
    return {
      kind: "error",
      code: "VALIDATION",
      message: "Este expediente fue importado y no está administrado por el aprovisionamiento automático.",
      recoverable: false
    };
  }
  if (
    isProvisioningInProgress(
      patient.provisioningStatus,
      patient.provisioningStartedAt,
      patient.createdAt
    )
  ) {
    return {
      kind: "error",
      code: "VALIDATION",
      message: "La preparación ya está en curso. Espera a que termine e intenta de nuevo.",
      recoverable: true
    };
  }

  let provisioned: Awaited<ReturnType<typeof provisionPatient>>;
  try {
    provisioned = await provisionPatient(patientId);
  } catch (error) {
    if (error instanceof PatientProvisioningAlreadyRunningError) {
      return {
        kind: "error",
        code: "UNKNOWN",
        message: error.message,
        recoverable: true,
        patientId
      };
    }
    throw error;
  }
  revalidatePath(`/patients/${patientId}`);
  return toCreateResult(provisioned);
}

export async function updatePatient(patientId: string, input: PatientInput) {
  await requireSession();
  const parsed = patientSchema.parse(input);

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      fullName: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phoneUnavailable ? null : normalizePhone(parsed.phone) || null,
      phoneUnavailable: parsed.phoneUnavailable,
      birthDate: inputDateToUtcNoon(parsed.birthDate),
      gender: parsed.gender || null,
      notes: parsed.notes || null
    }
  });

  await recordAudit("patient.updated", "Patient", patient.id);
  revalidatePath("/patients");
  revalidatePath(`/patients/${patient.id}`);

  return patient;
}

async function findDuplicatePatients(input: PatientInput) {
  const patients = await prisma.patient.findMany({
    select: { id: true, fullName: true, phone: true, birthDate: true }
  });
  const normalizedName = normalizePatientIdentity(input.fullName);
  const normalizedInputPhone = normalizePhone(input.phone);
  const birthDate = input.birthDate || null;

  return patients.filter((patient) => {
    const sameName = normalizePatientIdentity(patient.fullName) === normalizedName;
    const samePhone = normalizedInputPhone.length > 0 && normalizePhone(patient.phone) === normalizedInputPhone;
    const sameNameAndBirthDate = sameName
      && Boolean(birthDate)
      && patient.birthDate?.toISOString().slice(0, 10) === birthDate;
    return sameName || samePhone || sameNameAndBirthDate;
  });
}

function toCreateResult(patient: {
  id: string;
  provisioningStatus: string;
  provisioningError: string | null;
  googleFolderUrl: string | null;
}): CreatePatientResult {
  const status = ["READY", "PARTIAL", "FAILED"].includes(patient.provisioningStatus)
    ? patient.provisioningStatus as "READY" | "PARTIAL" | "FAILED"
    : "PARTIAL";
  return {
    kind: "created",
    patientId: patient.id,
    provisioningStatus: status,
    provisioningError: patient.provisioningError,
    googleFolderUrl: patient.googleFolderUrl
  };
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
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

export async function setPatientProfilePhoto(input: {
  patientId: string;
  attachmentId: string | null;
}) {
  const { patientId, attachmentId } = input;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient) {
    throw new Error("Paciente no encontrado");
  }

  if (attachmentId) {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId }
    });

    if (!attachment || attachment.patientId !== patientId) {
      throw new Error("Adjunto no válido para este paciente");
    }
  }

  await prisma.patient.update({
    where: { id: patientId },
    data: { profilePhotoId: attachmentId }
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/dashboard");

  return true;
}

export async function ensureProfilePhotos() {
  const patients = await prisma.patient.findMany({
    where: { profilePhotoId: null },
    include: {
      attachments: {
        orderBy: { importedAt: "asc" }
      }
    }
  });

  for (const patient of patients) {
    const firstPhoto = patient.attachments.find(
      (a) => a.category === "PHOTO"
    );
    if (firstPhoto) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { profilePhotoId: firstPhoto.id }
      });
    }
  }

  return { updated: patients.length };
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
