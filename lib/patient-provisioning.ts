const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

export const PATIENT_FOLDER_NAMES = {
  clinical: "Historia clínica",
  payments: "Historial de pagos",
  photos: "Fotos",
  radiographs: "Radiografías",
  receipts: "Recibos",
  other: "Otros",
} as const;

export const CLINICAL_HISTORY_FILE_NAME = "Historia clínica.txt";
export const PAYMENT_HISTORY_FILE_NAME = "Historial de pagos.xlsx";

export function normalizePatientIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export type ProvisioningCompletionStatus = "READY" | "PARTIAL" | "FAILED";

export const PROVISIONING_STALE_AFTER_MS = 5 * 60 * 1000;

export type ProvisioningClaimSnapshot = {
  id: string;
  provisioningStatus: "UNMANAGED" | "PENDING" | "IN_PROGRESS" | "PARTIAL" | "READY" | "FAILED";
  provisioningStartedAt: Date | null;
};

export function createProvisioningClaim(snapshot: ProvisioningClaimSnapshot, startedAt = new Date()) {
  return {
    where: {
      id: snapshot.id,
      provisioningStatus: snapshot.provisioningStatus,
      provisioningStartedAt: snapshot.provisioningStartedAt
    },
    data: {
      provisioningStatus: "IN_PROGRESS" as const,
      provisioningError: null,
      provisioningStartedAt: startedAt,
      provisioningAttempts: { increment: 1 }
    }
  };
}

export function resolveProvisioningCompletion(status: ProvisioningCompletionStatus) {
  return {
    preserveProvisionedAt: status !== "READY",
    auditEvent:
      status === "READY"
        ? "patient.provisioning_completed"
        : status === "PARTIAL"
          ? "patient.provisioning_partial"
          : "patient.provisioning_failed",
    retryable: status !== "READY"
  };
}

export function isProvisioningInProgress(
  status: string | null | undefined,
  provisioningStartedAt?: Date | string | null,
  createdAt?: Date | string | null,
  now = Date.now()
) {
  if (status !== "PENDING" && status !== "IN_PROGRESS") return false;

  // PENDING may be left behind if the app closed after inserting the patient
  // but before the provisioning service recorded its start timestamp.
  const timestamp = provisioningStartedAt ?? createdAt;
  if (!timestamp) return true;

  const startedAt = timestamp instanceof Date ? timestamp.getTime() : Date.parse(timestamp);
  if (!Number.isFinite(startedAt)) return true;

  return now - startedAt < PROVISIONING_STALE_AFTER_MS;
}

export function attachmentMetadataChanged(
  existing: {
    originalName: string;
    sourceRelativePath: string;
    mimeType: string | null;
    sizeBytes: number;
  },
  input: {
    originalName: string;
    sourceRelativePath: string;
    mimeType: string;
    sizeBytes: number;
  }
) {
  return (
    existing.originalName !== input.originalName ||
    existing.sourceRelativePath !== input.sourceRelativePath ||
    (existing.mimeType ?? null) !== input.mimeType ||
    existing.sizeBytes !== input.sizeBytes
  );
}

export function resolveInitialPhoneUnavailable(input: {
  patientId?: string;
  phone?: string | null;
  phoneUnavailable?: boolean | null;
}) {
  if (!input.patientId) return input.phoneUnavailable ?? false;
  return Boolean(input.phoneUnavailable) || !input.phone?.trim();
}

export function sanitizeWindowsPathSegment(value: string, maxLength = 82) {
  let sanitized = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!sanitized) sanitized = "Paciente";

  const stem = sanitized.split(".")[0]?.toUpperCase() ?? "";
  if (WINDOWS_RESERVED_NAMES.has(stem)) sanitized = `Paciente ${sanitized}`;

  sanitized = sanitized.slice(0, maxLength).replace(/[. ]+$/g, "").trim();
  return sanitized || "Paciente";
}

export function createStablePatientFolderName(fullName: string, patientId: string) {
  const shortId = patientId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "NUEVO";
  const suffix = ` [${shortId}]`;
  return `${sanitizeWindowsPathSegment(fullName, 100 - suffix.length)}${suffix}`;
}

export function createInitialClinicalHistory(input: {
  fullName: string;
  birthDate?: string | null;
  gender?: "MASCULINO" | "FEMENINO" | null;
  phone?: string | null;
  phoneUnavailable: boolean;
  email?: string | null;
  notes?: string | null;
}) {
  const gender = input.gender === "FEMENINO" ? "Femenino" : input.gender === "MASCULINO" ? "Masculino" : "Sin especificar";
  const phone = input.phoneUnavailable ? "No disponible (confirmado)" : input.phone?.trim() || "Sin especificar";
  const lines = [
    "HISTORIA CLÍNICA — FICHA INICIAL",
    "",
    `Nombre: ${input.fullName.trim()}`,
    `Fecha de nacimiento: ${input.birthDate?.trim() || "Sin especificar"}`,
    `Género: ${gender}`,
    `Teléfono: ${phone}`,
    `Correo: ${input.email?.trim() || "Sin especificar"}`,
    "",
    "Notas iniciales:",
    input.notes?.trim() || "Sin notas iniciales.",
    "",
    "Esta ficha refleja la información al momento del alta. La base de datos de OE Dental es la fuente oficial.",
    "",
  ];

  return lines.join("\r\n");
}

export function safeProvisioningError(error: unknown) {
  const fallback = "No se pudo completar la preparación del expediente";
  if (!(error instanceof Error)) return fallback;

  return error.message
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "una ruta local")
    .replace(/Bearer\s+\S+/gi, "Bearer [oculto]")
    .slice(0, 500) || fallback;
}
