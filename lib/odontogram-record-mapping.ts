import type { Prisma } from "@prisma/client";

import {
  recordIsValid,
  type DentalRecord,
  type DentalRecordChangeType,
  type DentalRecordVersion,
  type PatientOdontogramData,
  type Phase,
  type Surface,
  type ToothNumber,
  type TreatmentCode,
  type TreatmentStatus,
} from "@/lib/odontogram";

export const persistedOdontogramRecordSelect = {
  id: true,
  tooth: true,
  treatment: true,
  phase: true,
  status: true,
  notes: true,
  createdAt: true,
  surfaces: { select: { surface: true } },
} satisfies Prisma.OdontogramRecordSelect;

export type PersistedOdontogramRecord = Prisma.OdontogramRecordGetPayload<{
  select: typeof persistedOdontogramRecordSelect;
}>;

export const persistedOdontogramRecordVersionSelect = {
  id: true,
  recordId: true,
  tooth: true,
  treatment: true,
  phase: true,
  status: true,
  notes: true,
  recordCreatedAt: true,
  changeType: true,
  changedAt: true,
  surfaces: { select: { surface: true } },
} satisfies Prisma.OdontogramRecordVersionSelect;

export type PersistedOdontogramRecordVersion = Prisma.OdontogramRecordVersionGetPayload<{
  select: typeof persistedOdontogramRecordVersionSelect;
}>;

export const persistedOdontogramRecordWithHistorySelect = {
  ...persistedOdontogramRecordSelect,
  retiredAt: true,
  versions: {
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    select: persistedOdontogramRecordVersionSelect,
  },
} satisfies Prisma.OdontogramRecordSelect;

export type PersistedOdontogramRecordWithHistory = Prisma.OdontogramRecordGetPayload<{
  select: typeof persistedOdontogramRecordWithHistorySelect;
}>;

export const persistedOdontogramChartSelect = {
  revision: true,
  records: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: persistedOdontogramRecordWithHistorySelect,
  },
} satisfies Prisma.OdontogramSelect;

export type PersistedOdontogramChart = Prisma.OdontogramGetPayload<{
  select: typeof persistedOdontogramChartSelect;
}>;

const SURFACE_ORDER: readonly Surface[] = ["M", "D", "V", "L", "O", "I"];

export function mapPersistedOdontogramRecord(
  stored: PersistedOdontogramRecord,
): DentalRecord {
  const surfaces = stored.surfaces
    .map(({ surface }) => surface as Surface)
    .sort((left, right) => SURFACE_ORDER.indexOf(left) - SURFACE_ORDER.indexOf(right));

  const record: DentalRecord = {
    id: stored.id,
    tooth: stored.tooth as ToothNumber,
    treatment: stored.treatment as TreatmentCode,
    surfaces,
    phase: stored.phase as Phase,
    status: stored.status as TreatmentStatus,
    notes: stored.notes,
    createdAt: stored.createdAt.toISOString(),
  };

  if (!recordIsValid(record)) {
    throw new Error(`El registro ${stored.id} del odontograma contiene datos inválidos.`);
  }

  return record;
}

export function mapPersistedOdontogramRecordVersion(
  stored: PersistedOdontogramRecordVersion,
): DentalRecordVersion {
  const surfaces = stored.surfaces
    .map(({ surface }) => surface as Surface)
    .sort((left, right) => SURFACE_ORDER.indexOf(left) - SURFACE_ORDER.indexOf(right));
  const record: DentalRecord = {
    id: stored.recordId,
    tooth: stored.tooth as ToothNumber,
    treatment: stored.treatment as TreatmentCode,
    surfaces,
    phase: stored.phase as Phase,
    status: stored.status as TreatmentStatus,
    notes: stored.notes,
    createdAt: stored.recordCreatedAt.toISOString(),
  };

  if (!recordIsValid(record)) {
    throw new Error(`La versión ${stored.id} del odontograma contiene datos inválidos.`);
  }

  if (stored.changeType !== "updated" && stored.changeType !== "retired") {
    throw new Error(`La versión ${stored.id} del odontograma tiene un tipo de cambio inválido.`);
  }

  return {
    id: stored.id,
    recordId: stored.recordId,
    tooth: record.tooth,
    treatment: record.treatment,
    surfaces: record.surfaces,
    phase: record.phase,
    status: record.status,
    notes: record.notes,
    recordCreatedAt: record.createdAt,
    changeType: stored.changeType as DentalRecordChangeType,
    changedAt: stored.changedAt.toISOString(),
  };
}

export function mapPersistedOdontogramChart(
  stored: PersistedOdontogramChart,
): PatientOdontogramData {
  const records = stored.records;
  const history = records
    .flatMap((record) => record.versions.map(mapPersistedOdontogramRecordVersion))
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt) || right.id.localeCompare(left.id));

  return {
    revision: stored.revision,
    records: records
      .filter((record) => record.retiredAt === null)
      .map(mapPersistedOdontogramRecord),
    history,
  };
}
