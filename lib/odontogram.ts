/** Odontograma FDI / ISO 3950. Datos independientes del componente de UI. */
export const PERMANENT_UPPER = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
] as const;
export const PRIMARY_UPPER = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"] as const;
export const PRIMARY_LOWER = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"] as const;
export const PERMANENT_LOWER = [
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
] as const;

export const ALL_TEETH = [
  ...PERMANENT_UPPER, ...PRIMARY_UPPER, ...PRIMARY_LOWER, ...PERMANENT_LOWER,
] as const;

export type ToothNumber = (typeof ALL_TEETH)[number];
export type Surface = "M" | "D" | "V" | "L" | "O" | "I";
export type Phase = "previous" | "current";
export type TreatmentStatus = "pending" | "in_progress" | "completed";

export const SURFACE_LABELS: Record<Surface, string> = {
  M: "Mesial", D: "Distal", V: "Vestibular", L: "Lingual / palatina",
  O: "Oclusal", I: "Incisal",
};

export const TREATMENTS = [
  { code: "resin", label: "Resina compuesta", scope: "surface" },
  { code: "caries", label: "Caries", scope: "surface" },
  { code: "amalgam", label: "Amalgama", scope: "surface" },
  { code: "sealant", label: "Sellador", scope: "surface" },
  { code: "crown", label: "Corona", scope: "whole" },
  { code: "root_canal", label: "Endodoncia", scope: "whole" },
  { code: "extraction", label: "Exodoncia", scope: "whole" },
  { code: "implant", label: "Implante", scope: "whole" },
  { code: "missing", label: "Pieza ausente", scope: "whole" },
  { code: "other", label: "Otro", scope: "whole" },
] as const;
export type TreatmentCode = (typeof TREATMENTS)[number]["code"];

export interface DentalRecord {
  id: string;
  tooth: ToothNumber;
  treatment: TreatmentCode;
  surfaces: Surface[];
  phase: Phase;
  status: TreatmentStatus;
  notes: string;
  createdAt: string;
}

export type DentalRecordChangeType = "updated" | "retired";

export interface DentalRecordVersion {
  id: string;
  recordId: string;
  tooth: ToothNumber;
  treatment: TreatmentCode;
  surfaces: Surface[];
  phase: Phase;
  status: TreatmentStatus;
  notes: string;
  recordCreatedAt: string;
  changeType: DentalRecordChangeType;
  changedAt: string;
}

export interface PatientOdontogramData {
  revision: number;
  records: DentalRecord[];
  history: DentalRecordVersion[];
}

export type SaveOdontogramResult =
  | { success: true; data: PatientOdontogramData }
  | { success: false; error: string; latest?: PatientOdontogramData };

export function isToothNumber(value: string): value is ToothNumber {
  return (ALL_TEETH as readonly string[]).includes(value);
}

export function isAnterior(tooth: ToothNumber): boolean {
  return Number(tooth[1]) <= 3;
}

export function isMolar(tooth: ToothNumber): boolean {
  const position = Number(tooth[1]);
  return Number(tooth[0]) <= 4 ? position >= 6 : position >= 4;
}

export function availableSurfaces(tooth: ToothNumber): Surface[] {
  return isAnterior(tooth) ? ["M", "D", "V", "L", "I"] : ["M", "D", "V", "L", "O"];
}

export function isUpper(tooth: ToothNumber): boolean {
  return ["1", "2", "5", "6"].includes(tooth[0]);
}

/** En vista frontal, la superficie mesial mira siempre hacia la línea media. */
export function mesialIsRight(tooth: ToothNumber): boolean {
  return ["1", "4", "5", "8"].includes(tooth[0]);
}

export function getTreatment(code: TreatmentCode) {
  return TREATMENTS.find((t) => t.code === code)!;
}

export function recordColor(phase: Phase): string {
  return phase === "previous"
    ? "rgb(var(--dental-phase-previous))"
    : "rgb(var(--dental-phase-current))";
}

export function recordIsValid(record: DentalRecord): boolean {
  if (!record || !isToothNumber(record.tooth) || !Array.isArray(record.surfaces)) return false;
  if (record.phase !== "previous" && record.phase !== "current") return false;
  if (record.status !== "pending" && record.status !== "in_progress" && record.status !== "completed") return false;
  const treatment = TREATMENTS.find((item) => item.code === record.treatment);
  if (!treatment) return false;
  if (new Set(record.surfaces).size !== record.surfaces.length) return false;
  return treatment.scope === "whole"
    ? record.surfaces.length === 0
    : record.surfaces.length > 0 && record.surfaces.every((s) => availableSurfaces(record.tooth).includes(s));
}

/** Compara solo el contenido clínico editable, ignorando ID, fecha y orden de superficies. */
export function sameDentalRecordContent(left: DentalRecord, right: DentalRecord): boolean {
  return left.tooth === right.tooth
    && left.treatment === right.treatment
    && left.phase === right.phase
    && left.status === right.status
    && left.notes.trim() === right.notes.trim()
    && left.surfaces.length === right.surfaces.length
    && left.surfaces.every((surface) => right.surfaces.includes(surface));
}

/** Registros con la misma pieza y tratamiento cuyas superficies se cruzan. */
export function findDuplicateRecords(
  records: readonly DentalRecord[],
  candidate: DentalRecord,
  excludeRecordId?: string,
): DentalRecord[] {
  const treatment = getTreatment(candidate.treatment);

  return records.filter((record) => {
    if (record.id === excludeRecordId) return false;
    if (record.tooth !== candidate.tooth || record.treatment !== candidate.treatment) return false;
    if (treatment.scope === "whole") return true;
    return candidate.surfaces.some((surface) => record.surfaces.includes(surface));
  });
}

/** Agrega un registro nuevo o reemplaza uno existente sin cambiar su identidad ni fecha original. */
export function upsertDentalRecord(
  records: readonly DentalRecord[],
  candidate: DentalRecord,
): DentalRecord[] {
  const existing = records.find((record) => record.id === candidate.id);
  if (!existing) return [...records, candidate];

  return records.map((record) => record.id === candidate.id
    ? { ...candidate, id: existing.id, createdAt: existing.createdAt }
    : record);
}
