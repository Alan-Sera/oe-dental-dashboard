import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PatientDetailTabs } from "@/components/patient-detail-tabs";
import { Button } from "@/components/ui/button";
import { getPatientById } from "@/lib/actions/patient.actions";
import type { SerializedPatientDetail } from "@/types";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const patient = await getPatientById(patientId);

  if (!patient) {
    notFound();
  }

  const serializedPatient = JSON.parse(JSON.stringify(patient)) as SerializedPatientDetail;

  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/patients">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Pacientes
            </Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold text-white">{patient.fullName}</h1>
          <p className="muted">{patient.phone ?? "Sin teléfono"} · {patient.email ?? "Sin correo"}</p>
        </div>
      </div>

      <PatientDetailTabs patient={serializedPatient} />
    </main>
  );
}
