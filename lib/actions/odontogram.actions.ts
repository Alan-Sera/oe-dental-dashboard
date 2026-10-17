"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentSession } from "@/lib/auth";
import { queryPatientOdontogramData } from "@/lib/odontogram-data";
import {
  mapPersistedOdontogramChart,
  persistedOdontogramChartSelect,
  persistedOdontogramRecordSelect,
  type PersistedOdontogramRecord,
} from "@/lib/odontogram-record-mapping";
import {
  odontogramPatientIdSchema,
  odontogramRecordsInputSchema,
  odontogramRevisionSchema,
} from "@/lib/odontogram-validation";
import { prisma } from "@/lib/prisma";
import type {
  DentalRecord,
  DentalRecordChangeType,
  PatientOdontogramData,
  SaveOdontogramResult,
  Surface,
} from "@/lib/odontogram";

class OdontogramSaveError extends Error {}
class OdontogramConflictError extends Error {}

type ExistingOdontogramRecord = PersistedOdontogramRecord & { retiredAt: Date | null };

function sameSurfaces(left: readonly Surface[], right: readonly Surface[]) {
  const order: readonly Surface[] = ["M", "D", "V", "L", "O", "I"];
  const leftSorted = [...left].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const rightSorted = [...right].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return leftSorted.length === rightSorted.length
    && leftSorted.every((surface, index) => surface === rightSorted[index]);
}

function recordContentsMatch(stored: PersistedOdontogramRecord, incoming: DentalRecord) {
  return stored.tooth === incoming.tooth
    && stored.treatment === incoming.treatment
    && stored.phase === incoming.phase
    && stored.status === incoming.status
    && stored.notes === incoming.notes
    && sameSurfaces(
      stored.surfaces.map(({ surface }) => surface as Surface),
      incoming.surfaces,
    );
}

async function createRecordVersion(
  tx: Prisma.TransactionClient,
  record: PersistedOdontogramRecord,
  changeType: DentalRecordChangeType,
) {
  await tx.odontogramRecordVersion.create({
    data: {
      recordId: record.id,
      tooth: record.tooth,
      treatment: record.treatment,
      phase: record.phase,
      status: record.status,
      notes: record.notes,
      recordCreatedAt: record.createdAt,
      changeType,
      surfaces: {
        create: record.surfaces.map(({ surface }) => ({ surface })),
      },
    },
  });
}

async function persistOdontogram(
  patientId: string,
  expectedRevision: number,
  records: DentalRecord[],
): Promise<PatientOdontogramData> {
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new OdontogramSaveError("No se encontró el expediente del paciente.");
    }

    const odontogram = await tx.odontogram.upsert({
      where: { patientId },
      update: {},
      create: { patientId },
      select: { id: true },
    });

    const revisionClaim = await tx.odontogram.updateMany({
      where: { id: odontogram.id, revision: expectedRevision },
      data: { revision: { increment: 1 } },
    });

    if (revisionClaim.count !== 1) {
      throw new OdontogramConflictError();
    }

    const requestedIds = records.map(({ id }) => id);
    const recordsUsingRequestedIds = requestedIds.length > 0
      ? await tx.odontogramRecord.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true, odontogramId: true, retiredAt: true },
      })
      : [];

    if (recordsUsingRequestedIds.some((record) =>
      record.odontogramId !== odontogram.id || record.retiredAt !== null
    )) {
      throw new OdontogramConflictError();
    }

    const allStoredRecords = await tx.odontogramRecord.findMany({
      where: { odontogramId: odontogram.id },
      select: { ...persistedOdontogramRecordSelect, retiredAt: true },
    }) as ExistingOdontogramRecord[];
    const activeRecords = allStoredRecords.filter((record) => record.retiredAt === null);
    const existingById = new Map(activeRecords.map((record) => [record.id, record]));
    const submittedIds = new Set(requestedIds);
    const removedRecords = activeRecords.filter((record) => !submittedIds.has(record.id));

    for (const record of removedRecords) {
      await createRecordVersion(tx, record, "retired");
    }

    if (removedRecords.length > 0) {
      await tx.odontogramRecord.updateMany({
        where: {
          odontogramId: odontogram.id,
          id: { in: removedRecords.map(({ id }) => id) },
          retiredAt: null,
        },
        data: { retiredAt: new Date() },
      });
    }

    for (const record of records) {
      const existing = existingById.get(record.id);
      const recordData = {
        tooth: record.tooth,
        treatment: record.treatment,
        phase: record.phase,
        status: record.status,
        notes: record.notes,
      };
      const surfaces = record.surfaces.map((surface) => ({ surface }));

      if (existing) {
        if (!recordContentsMatch(existing, record)) {
          await createRecordVersion(tx, existing, "updated");
          await tx.odontogramRecord.update({
            where: { id: record.id },
            data: {
              ...recordData,
              surfaces: {
                deleteMany: {},
                create: surfaces,
              },
            },
          });
        }
      } else {
        await tx.odontogramRecord.create({
          data: {
            id: record.id,
            odontogramId: odontogram.id,
            ...recordData,
            surfaces: { create: surfaces },
          },
        });
      }
    }

    const savedChart = await tx.odontogram.findUnique({
      where: { id: odontogram.id },
      select: persistedOdontogramChartSelect,
    });

    if (!savedChart) {
      throw new OdontogramSaveError("No se pudo volver a leer el odontograma guardado.");
    }

    return mapPersistedOdontogramChart(savedChart);
  });
}

export async function savePatientOdontogram(
  patientIdInput: unknown,
  recordsInput: unknown,
  expectedRevisionInput: unknown,
): Promise<SaveOdontogramResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      success: false,
      error: "Tu sesión ya no está activa. El borrador sigue disponible; vuelve a iniciar sesión antes de guardar.",
    };
  }

  const patientIdResult = odontogramPatientIdSchema.safeParse(patientIdInput);
  if (!patientIdResult.success) {
    return { success: false, error: "No se pudo identificar al paciente." };
  }

  const recordsResult = odontogramRecordsInputSchema.safeParse(recordsInput);
  if (!recordsResult.success) {
    return {
      success: false,
      error: recordsResult.error.issues[0]?.message ?? "Los datos del odontograma no son válidos.",
    };
  }

  const revisionResult = odontogramRevisionSchema.safeParse(expectedRevisionInput);
  if (!revisionResult.success) {
    return { success: false, error: "La revisión local del odontograma no es válida. Recarga el expediente." };
  }

  const patientId = patientIdResult.data;

  try {
    const data = await persistOdontogram(patientId, revisionResult.data, recordsResult.data);
    revalidatePath(`/patients/${patientId}`);
    return { success: true, data };
  } catch (error) {
    if (error instanceof OdontogramConflictError) {
      let latest: PatientOdontogramData | undefined;
      try {
        latest = await queryPatientOdontogramData(patientId);
      } catch {
        // Se mantiene el borrador incluso si tampoco se pudo consultar el estado remoto.
      }

      return {
        success: false,
        error: "El odontograma cambió desde que lo abriste. No se guardó este borrador; compáralo con la versión guardada antes de continuar.",
        ...(latest ? { latest } : {}),
      };
    }

    if (error instanceof OdontogramSaveError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "No se guardaron los cambios. El borrador sigue disponible; inténtalo nuevamente.",
    };
  }
}
