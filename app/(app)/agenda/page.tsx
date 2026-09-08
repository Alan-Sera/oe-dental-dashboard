import { addDays, fromDateKey, startOfWeek, toDateKey } from "@/lib/date-utils";
import { getAppointmentsInRange, listAppointmentPatients, maybeAutoSyncAgenda } from "@/lib/actions/appointments.actions";
import { getGoogleConnectionStatus } from "@/lib/google-settings";
import type { ScheduleView } from "@/components/schedule/constants";
import { AgendaView } from "@/components/schedule/agenda-view";
import type { AgendaAppointment } from "@/components/schedule/types";

export const dynamic = "force-dynamic";

type AgendaSearchParams = {
  view?: string;
  date?: string;
  paciente?: string;
  cita?: string;
};

export default async function AgendaPage({
  searchParams
}: {
  searchParams: Promise<AgendaSearchParams>;
}) {
  const params = await searchParams;
  const view: ScheduleView = params.view === "week" || params.view === "day" ? params.view : "month";
  const date = isDateKey(params.date) ? fromDateKey(params.date) : new Date();
  const dateKey = toDateKey(date);

  const range = getRangeForView(view, date);

  const orphanEvents = await maybeAutoSyncAgenda();

  const [appointments, patients, googleStatus] = await Promise.all([
    getAppointmentsInRange(range.start, range.end),
    listAppointmentPatients(),
    getGoogleConnectionStatus()
  ]);

  const serializedAppointments: AgendaAppointment[] = appointments.map((appointment) => ({
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
      <AgendaView
        view={view}
        dateKey={dateKey}
        appointments={serializedAppointments}
        patients={patients}
        googleStatus={googleStatus}
        initialPatientId={params.paciente}
        focusAppointmentId={params.cita}
        initialOrphans={orphanEvents}
      />
    </main>
  );
}

function getRangeForView(view: ScheduleView, date: Date) {
  if (view === "month") {
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const gridStart = startOfWeek(firstOfMonth);
    return { start: gridStart, end: addDays(gridStart, 42) };
  }

  if (view === "week") {
    const weekStart = startOfWeek(date);
    return { start: weekStart, end: addDays(weekStart, 7) };
  }

  return { start: date, end: addDays(date, 1) };
}

function isDateKey(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}