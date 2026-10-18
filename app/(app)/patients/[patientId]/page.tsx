import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PatientDetailTabs } from "@/components/patient-detail-tabs";
import { LoadingLink } from "@/components/loading-link";
import { PatientAvatar } from "@/components/patient-avatar";
import { PatientProvisioningStatus } from "@/components/patient-provisioning-status";
import { Button } from "@/components/ui/button";
import { getPatientById } from "@/lib/actions/patient.actions";
import { getPatientMissingAttachmentIds } from "@/lib/actions/settings.actions";
import { getUpcomingPatientAppointments } from "@/lib/actions/appointments.actions";
import { getPatientOdontogramData } from "@/lib/odontogram-data";
import { getPatientFileSyncRuntime } from "@/lib/patient-file-sync-runtime";
import { getPatientClinicalFileConflicts } from "@/lib/clinical-file-conflicts";
import { getPatientPaymentFileStates } from "@/lib/payment-file-versions";
import type { SerializedPatientDetail } from "@/types";
import type { AgendaAppointment } from "@/components/schedule/types";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const initialFileSyncRevision = getPatientFileSyncRuntime().revisionForPatient(patientId);
  const [patient, missingAttachmentIds, upcomingAppointmentsRaw, odontogramData] = await Promise.all([
    getPatientById(patientId),
    getPatientMissingAttachmentIds(patientId),
    getUpcomingPatientAppointments(patientId),
    getPatientOdontogramData(patientId)
  ]);

  if (!patient) {
    notFound();
  }

  const [clinicalFileConflicts, paymentFileStates] = await Promise.all([
    getPatientClinicalFileConflicts(patient),
    getPatientPaymentFileStates(patient)
  ]);

  const serializedPatient = JSON.parse(JSON.stringify({
    ...patient,
    odontogramRecords: odontogramData.records,
    odontogramRevision: odontogramData.revision,
    odontogramHistory: odontogramData.history,
  })) as SerializedPatientDetail;

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
            <LoadingLink href="/patients" loadingLabel="Cargando pacientes...">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Pacientes
            </LoadingLink>
          </Button>
          <div className="mt-2 flex items-center gap-3">
            <PatientAvatar
              fullName={patient.fullName}
              photoAttachmentId={serializedPatient.profilePhotoId}
              photoVersion={serializedPatient.attachments.find((attachment) => attachment.id === serializedPatient.profilePhotoId)?.sourceModifiedAt}
              size="lg"
            />
            <div>
              <h1 className="text-2xl font-semibold text-theme-strong">{patient.fullName}</h1>
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
        initialFileSyncRevision={initialFileSyncRevision}
        clinicalFileConflicts={clinicalFileConflicts}
        paymentFileStates={paymentFileStates}
      />
    </main>
  );
}
