import "server-only";

import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { recordAudit } from "@/lib/actions/audit.actions";
import {
  createGoogleDriveFolder,
  findGoogleDriveResource,
  getGoogleOAuthConfig,
  isMissingGoogleDriveResource,
  isTransientGoogleDriveError,
  refreshGoogleAccessToken,
  verifyGoogleDriveFolder
} from "@/lib/google-drive";
import { getGoogleDriveRefreshToken } from "@/lib/google-settings";
import { createPatientFileScaffold, readTextFileContent } from "@/lib/patient-files";
import {
  CLINICAL_HISTORY_FILE_NAME,
  createProvisioningClaim,
  createInitialClinicalHistory,
  createStablePatientFolderName,
  PATIENT_FOLDER_NAMES,
  PAYMENT_HISTORY_FILE_NAME,
  resolveProvisioningCompletion,
  attachmentMetadataChanged,
  safeProvisioningError
} from "@/lib/patient-provisioning";
import { joinStoredRelativePath, normalizePatientsRootPath } from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import { GOOGLE_PATIENTS_ROOT_ID } from "@/lib/google-constants";
import { ensurePaymentHistorySheetUploaded } from "@/lib/services/payment-history-upload";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PAYMENT_TEMPLATE_PATH = path.join(process.cwd(), "assets", "templates", "payment-history.xlsx");

export class PatientProvisioningPreflightError extends Error {
  constructor(
    public readonly code: "LOCAL_ROOT_MISSING" | "LOCAL_ROOT_UNWRITABLE" | "TEMPLATE_MISSING",
    message: string
  ) {
    super(message);
    this.name = "PatientProvisioningPreflightError";
  }
}

export class PatientProvisioningAlreadyRunningError extends Error {
  constructor() {
    super("La preparación del expediente ya está en curso. Espera a que termine e intenta de nuevo.");
    this.name = "PatientProvisioningAlreadyRunningError";
  }
}

export type PatientProvisioningReadiness = {
  local: { ready: boolean; message: string };
  template: { ready: boolean; message: string };
  google: { ready: boolean; message: string };
};

export async function inspectPatientProvisioningReadiness(): Promise<PatientProvisioningReadiness> {
  const settings = await getProvisioningSettings();
  let local = { ready: false, message: "Configura la carpeta maestra en Ajustes." };
  if (settings.patientsRootPath) {
    try {
      const rootPath = normalizePatientsRootPath(settings.patientsRootPath);
      const rootStats = await stat(rootPath);
      await access(rootPath, constants.R_OK | constants.W_OK);
      local = rootStats.isDirectory()
        ? { ready: true, message: "Carpeta local disponible." }
        : { ready: false, message: "La ruta local no es una carpeta." };
    } catch {
      local = { ready: false, message: "La carpeta local no existe o no permite escribir." };
    }
  }

  let template = { ready: false, message: "Falta assets/templates/payment-history.xlsx." };
  try {
    const templateStats = await stat(PAYMENT_TEMPLATE_PATH);
    if (templateStats.isFile()) template = { ready: true, message: "Plantilla XLSX disponible." };
  } catch {
    // La ausencia se presenta como estado, no como excepción.
  }

  let google = { ready: false, message: "Drive no está disponible; el alta quedará pendiente." };
  const config = getGoogleOAuthConfig();
  const refreshToken = await getGoogleDriveRefreshToken().catch(() => null);
  if (!config || !refreshToken) {
    google = { ready: false, message: "Conecta Google para preparar Drive." };
  } else {
    try {
      const accessToken = await refreshGoogleAccessToken(config, refreshToken);
      const folder = await verifyGoogleDriveFolder(accessToken, GOOGLE_PATIENTS_ROOT_ID);
      google = { ready: true, message: `Drive disponible: ${folder.name}.` };
    } catch (error) {
      google = {
        ready: false,
        message: error instanceof Error ? error.message : "No se pudo verificar Drive."
      };
    }
  }

  return { local, template, google };
}

export async function preflightPatientProvisioning() {
  const settings = await getProvisioningSettings();
  if (!settings.patientsRootPath) {
    throw new PatientProvisioningPreflightError(
      "LOCAL_ROOT_MISSING",
      "Configura la carpeta maestra de pacientes en Ajustes antes de crear un paciente."
    );
  }

  const rootPath = normalizePatientsRootPath(settings.patientsRootPath);
  try {
    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) throw new Error("not-directory");
    await access(rootPath, constants.R_OK | constants.W_OK);
  } catch {
    throw new PatientProvisioningPreflightError(
      "LOCAL_ROOT_UNWRITABLE",
      "La carpeta maestra no existe o no permite crear expedientes. Revísala en Ajustes."
    );
  }

  try {
    const templateStats = await stat(PAYMENT_TEMPLATE_PATH);
    if (!templateStats.isFile()) throw new Error("not-file");
  } catch {
    throw new PatientProvisioningPreflightError(
      "TEMPLATE_MISSING",
      "Falta la plantilla assets/templates/payment-history.xlsx. Agrégala sin datos de pacientes para habilitar el alta."
    );
  }

  return { ...settings, rootPath, templatePath: PAYMENT_TEMPLATE_PATH };
}

export async function provisionPatient(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new Error("Paciente no encontrado");

  // Claim the attempt with compare-and-set before touching local or Drive resources.
  // This makes concurrent retries race on one database write; only one can proceed.
  const claim = await prisma.patient.updateMany(
    createProvisioningClaim(patient, new Date())
  );
  if (claim.count !== 1) throw new PatientProvisioningAlreadyRunningError();
  await auditProvisioning("patient.provisioning_started", patientId);

  let preflight: Awaited<ReturnType<typeof preflightPatientProvisioning>>;
  try {
    preflight = await preflightPatientProvisioning();
  } catch (error) {
    return finishProvisioning(patientId, "FAILED", safeProvisioningError(error));
  }

  let localResources: Awaited<ReturnType<typeof ensureLocalResources>>;
  try {
    localResources = await ensureLocalResources(patient, preflight.rootPath, preflight.templatePath);
    await auditProvisioning("patient.provisioning_local_ready", patientId);
  } catch (error) {
    return finishProvisioning(patientId, "FAILED", safeProvisioningError(error));
  }

  try {
    await ensureGoogleResources({
      patientId,
      stableFolderName: localResources.stableFolderName,
      googleRootId: GOOGLE_PATIENTS_ROOT_ID,
      paymentHistorySheetId: localResources.paymentHistorySheetId,
      paymentFilePath: localResources.paymentFilePath
    });
    await auditProvisioning("patient.provisioning_drive_ready", patientId);
    return finishProvisioning(patientId, "READY", null);
  } catch (error) {
    return finishProvisioning(patientId, "PARTIAL", safeProvisioningError(error));
  }
}

async function ensureLocalResources(
  patient: {
    id: string;
    fullName: string;
    birthDate: Date | null;
    gender: "MASCULINO" | "FEMENINO" | null;
    phone: string | null;
    phoneUnavailable: boolean;
    email: string | null;
    notes: string | null;
    localFolderRelativePath: string | null;
    createdAt: Date;
  },
  rootPath: string,
  templatePath: string
) {
  const stableFolderName = patient.localFolderRelativePath
    ?? createStablePatientFolderName(patient.fullName, patient.id);
  if (!patient.localFolderRelativePath) {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { localFolderRelativePath: stableFolderName }
    });
  }

  const clinicalRelativePath = joinStoredRelativePath(
    PATIENT_FOLDER_NAMES.clinical,
    CLINICAL_HISTORY_FILE_NAME
  );
  const paymentRelativePath = joinStoredRelativePath(
    PATIENT_FOLDER_NAMES.payments,
    PAYMENT_HISTORY_FILE_NAME
  );
  const clinicalText = createInitialClinicalHistory({
    fullName: patient.fullName,
    birthDate: patient.birthDate?.toISOString().slice(0, 10),
    gender: patient.gender,
    phone: patient.phone,
    phoneUnavailable: patient.phoneUnavailable,
    email: patient.email,
    notes: patient.notes
  });

  const { clinicalFilePath, paymentFilePath } = await createPatientFileScaffold({
    rootPath,
    stableFolderName,
    clinicalText,
    templatePath
  });

  const [clinicalStats, paymentStats] = await Promise.all([stat(clinicalFilePath), stat(paymentFilePath)]);
  // El archivo manda: si pre-existía de un intento previo, su contenido es la fuente oficial
  // para la ficha clínica (el scaffold nunca sobrescribe).
  const storedClinicalText = await readTextFileContent(clinicalFilePath);
  const clinicalAttachment = await findOrCreateAttachment({
    patientId: patient.id,
    category: "CLINICAL_HISTORY",
    originalName: CLINICAL_HISTORY_FILE_NAME,
    localRelativePath: clinicalRelativePath,
    sourceRelativePath: joinStoredRelativePath(stableFolderName, clinicalRelativePath),
    mimeType: "text/plain; charset=utf-8",
    sizeBytes: clinicalStats.size
  });
  const paymentAttachment = await findOrCreateAttachment({
    patientId: patient.id,
    category: "PAYMENT_HISTORY",
    originalName: PAYMENT_HISTORY_FILE_NAME,
    localRelativePath: paymentRelativePath,
    sourceRelativePath: joinStoredRelativePath(stableFolderName, paymentRelativePath),
    mimeType: XLSX_MIME_TYPE,
    sizeBytes: paymentStats.size
  });

  const existingClinicalEntry = await prisma.clinicalEntry.findFirst({
    where: { patientId: patient.id, attachments: { some: { id: clinicalAttachment.id } } },
    select: { id: true }
  });
  if (!existingClinicalEntry) {
    await prisma.clinicalEntry.create({
      data: {
        patientId: patient.id,
        entryDate: patient.createdAt,
        notes: storedClinicalText,
        attachments: { connect: { id: clinicalAttachment.id } }
      }
    });
  }

  let paymentHistorySheet = await prisma.paymentHistorySheet.findUnique({
    where: { attachmentId: paymentAttachment.id }
  });
  if (!paymentHistorySheet) {
    await prisma.paymentHistorySheet.updateMany({
      where: { patientId: patient.id, isActive: true },
      data: { isActive: false }
    });
    paymentHistorySheet = await prisma.paymentHistorySheet.create({
      data: {
        patientId: patient.id,
        attachmentId: paymentAttachment.id,
        uploadStatus: "LOCAL_ONLY",
        isActive: true
      }
    });
  }

  return {
    stableFolderName,
    paymentFilePath,
    paymentHistorySheetId: paymentHistorySheet.id
  };
}

async function ensureGoogleResources(input: {
  patientId: string;
  stableFolderName: string;
  googleRootId: string;
  paymentHistorySheetId: string;
  paymentFilePath: string;
}) {
  const config = getGoogleOAuthConfig();
  const refreshToken = await getGoogleDriveRefreshToken();
  if (!config || !refreshToken) {
    throw new Error("El expediente local está listo. Conecta Google desde Ajustes para completar Drive.");
  }

  const accessToken = await refreshGoogleAccessToken(config, refreshToken);
  await verifyGoogleDriveFolder(accessToken, input.googleRootId);
  const storedPatient = await prisma.patient.findUniqueOrThrow({ where: { id: input.patientId } });
  const driveFolder = await findOrCreatePatientDriveFolder({
    accessToken,
    parentId: input.googleRootId,
    patientId: input.patientId,
    name: input.stableFolderName,
    existingFolderId: storedPatient.googleFolderId
  });

  if (!driveFolder) {
    throw new Error("Google Drive no devolvió la carpeta del paciente");
  }

  const driveFolderUrl = driveFolder.webViewLink
    ?? `https://drive.google.com/drive/folders/${driveFolder.id}`;
  await prisma.patient.update({
    where: { id: input.patientId },
    data: { googleFolderId: driveFolder.id, googleFolderUrl: driveFolderUrl }
  });

  await ensurePaymentHistorySheetUploaded({
    sheetId: input.paymentHistorySheetId,
    patientId: input.patientId,
    accessToken,
    targetFolderId: driveFolder.id,
    fileName: PAYMENT_HISTORY_FILE_NAME,
    loadFileBuffer: () => readFile(input.paymentFilePath)
  });
}

async function findOrCreatePatientDriveFolder(input: {
  accessToken: string;
  parentId: string;
  patientId: string;
  name: string;
  existingFolderId?: string | null;
}) {
  if (input.existingFolderId) {
    try {
      return await verifyGoogleDriveFolder(input.accessToken, input.existingFolderId);
    } catch (error) {
      if (!isMissingGoogleDriveResource(error)) throw error;
      await prisma.patient.update({
        where: { id: input.patientId },
        data: { googleFolderId: null, googleFolderUrl: null }
      });
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await findGoogleDriveResource({
      accessToken: input.accessToken,
      parentId: input.parentId,
      patientId: input.patientId,
      resourceType: "patient-folder"
    });
    if (existing) return existing;

    try {
      return await createGoogleDriveFolder({
        accessToken: input.accessToken,
        parentId: input.parentId,
        name: input.name,
        patientId: input.patientId
      });
    } catch (error) {
      if (!isTransientGoogleDriveError(error) || attempt === 2) throw error;
      await limitedBackoff(attempt);
    }
  }
  return null;
}

function limitedBackoff(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
}

async function finishProvisioning(
  patientId: string,
  status: "READY" | "PARTIAL" | "FAILED",
  error: string | null
) {
  const completion = resolveProvisioningCompletion(status);
  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      provisioningStatus: status,
      provisioningError: error,
      ...(completion.preserveProvisionedAt ? {} : { provisionedAt: new Date() })
    },
    select: {
      id: true,
      provisioningStatus: true,
      provisioningError: true,
      googleFolderUrl: true
    }
  });
  await auditProvisioning(completion.auditEvent, patientId, {
    status,
    retryable: completion.retryable
  });
  return patient;
}

async function findOrCreateAttachment(input: {
  patientId: string;
  category: "CLINICAL_HISTORY" | "PAYMENT_HISTORY";
  originalName: string;
  localRelativePath: string;
  sourceRelativePath: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const existing = await prisma.attachment.findUnique({
    where: {
      patientId_localRelativePath: {
        patientId: input.patientId,
        localRelativePath: input.localRelativePath
      }
    }
  });
  if (!existing) return prisma.attachment.create({ data: input });
  if (
    attachmentMetadataChanged(
      {
        originalName: existing.originalName,
        sourceRelativePath: existing.sourceRelativePath,
        mimeType: existing.mimeType,
        sizeBytes: existing.sizeBytes
      },
      input
    )
  ) {
    return prisma.attachment.update({
      where: { id: existing.id },
      data: {
        originalName: input.originalName,
        sourceRelativePath: input.sourceRelativePath,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes
      }
    });
  }
  return existing;
}

async function getProvisioningSettings() {
  const settings = await prisma.setting.findMany({
    where: { key: "files.patientsRootPath" }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    patientsRootPath: values.get("files.patientsRootPath") ?? process.env.PATIENTS_ROOT_PATH ?? ""
  };
}

async function auditProvisioning(event: string, patientId: string, metadata?: Record<string, unknown>) {
  await recordAudit(event, "Patient", patientId, metadata);
}
