import "server-only";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  mapPersistedOdontogramChart,
  persistedOdontogramChartSelect,
} from "@/lib/odontogram-record-mapping";
import type { PatientOdontogramData } from "@/lib/odontogram";

export async function queryPatientOdontogramData(patientId: string): Promise<PatientOdontogramData> {
  const odontogram = await prisma.odontogram.findUnique({
    where: { patientId },
    select: persistedOdontogramChartSelect,
  });

  if (!odontogram) {
    return { revision: 0, records: [], history: [] };
  }

  return mapPersistedOdontogramChart(odontogram);
}

export async function getPatientOdontogramData(patientId: string) {
  await requireSession();
  return queryPatientOdontogramData(patientId);
}
