import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PatientDetailTabs } from "@/components/patient-detail-tabs";
import { PatientAvatar } from "@/components/patient-avatar";
import { PatientProvisioningStatus } from "@/components/patient-provisioning-status";
import { Button } from "@/components/ui/button";
import { getPatientById } from "@/lib/actions/patient.actions";
import { getPatientMissingAttachmentIds } from "@/lib/actions/settings.actions";
import { getUpcomingPatientAppointments } from "@/lib/actions/appointments.actions";
import type { SerializedPatientDetail } from "@/types";
import type { AgendaAppointment } from "@/components/schedule/types";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, missingAttachmentIds, upcomingAppointmentsRaw] = await Promise.all([
    getPatientById(patientId),
    getPatientMissingAttachmentIds(patientId),
    getUpcomingPatientAppointments(patientId)
  ]);

  if (!patient) {
    notFound();
  }

  const serializedPatient = JSON.parse(JSON.stringify(patient)) as SerializedPatientDetail;

  const upcomingAppointments: AgendaAppointment[] = upcomingAppointmentsRaw.map((appointment) => ({
    id: appointment.id,
    patientId: appointment.patientId,
    title: appointment.title,
    description: appointment.description,
    startTime: appointment.startTime.toISOString(),
    endTime: appointment.endTime.toISOString(),
    status: appointment.status,
    color: appointment.colorId,
    googleEventId: appointment.googleEventId,
    patientName: appointment.patient.fullName,
    patientPhone: appointment.patient.phone,
    patientEmail: appointment.patient.email
  }));

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
          <div className="mt-2 flex items-center gap-3">
            <PatientAvatar
              fullName={patient.fullName}
              photoAttachmentId={serializedPatient.profilePhotoId}
              size="lg"
            />
            <div>
              <h1 className="text-2xl font-semibold text-white">{patient.fullName}</h1>
              <p className="muted">{patient.phone ?? "Sin teléfono"} · {patient.email ?? "Sin correo"}</p>
            </div>
          </div>
        </div>
      </div>

      <PatientProvisioningStatus patient={serializedPatient} />

      <PatientDetailTabs
        patient={serializedPatient}
        missingAttachmentIds={missingAttachmentIds}
        upcomingAppointments={upcomingAppointments}
      />
    </main>
  );
}
