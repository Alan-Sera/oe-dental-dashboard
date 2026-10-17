"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";

import { addDays, addMonths, fromDateKey, toDateKey, toDatetimeLocal } from "@/lib/date-utils";
import { buildAgendaAdoptionUrl } from "@/lib/agenda-adoption-navigation";
import { refreshAgendaGoogleState, syncAllAppointmentsToGoogle } from "@/lib/actions/appointments.actions";
import { DEFAULT_APPOINTMENT_MINUTES, type ScheduleView } from "@/components/schedule/constants";
import { CalendarHeader } from "@/components/schedule/calendar-header";
import { MonthView } from "@/components/schedule/month-view";
import { WeekView } from "@/components/schedule/week-view";
import { DayView } from "@/components/schedule/day-view";
import { AppointmentModal } from "@/components/schedule/appointment-modal";
import { LoadingLink } from "@/components/loading-link";
import type { TimelineCreatePoint } from "@/components/schedule/day-column";
import type {
  AgendaAppointment,
  AgendaPatient,
  GoogleCalendarStatus,
  GoogleSyncSummary,
  OrphanGoogleEvent
} from "@/components/schedule/types";
import { toastManager } from "@/components/toast-providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGlobalLoading } from "@/components/loading-provider";
import { useNavigationGuard } from "@/components/navigation-guard-provider";

type ModalState =
  | {
    mode: "create";
    startTime: string;
    endTime: string;
    patientId?: string;
    adoptGoogleEventId?: string | null;
    title?: string;
    description?: string;
  }
  | { mode: "edit"; appointment: AgendaAppointment }
  | null;

const UI_REFRESH_MS = 30 * 1000;

export function AgendaView({
  view,
  dateKey,
  appointments,
  patients,
  googleStatus,
  initialPatientId,
  focusAppointmentId,
  initialOrphans,
  initialAdoptGoogleEventId
}: {
  view: ScheduleView;
  dateKey: string;
  appointments: AgendaAppointment[];
  patients: AgendaPatient[];
  googleStatus?: GoogleCalendarStatus | null;
  initialPatientId?: string | null;
  focusAppointmentId?: string | null;
  initialOrphans?: OrphanGoogleEvent[];
  initialAdoptGoogleEventId?: string | null;
}) {
  const router = useRouter();
  const { startNavigation } = useGlobalLoading();
  const { requestNavigation } = useNavigationGuard();
  const [modal, setModal] = useState<ModalState>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<GoogleSyncSummary | null>(null);
  const [clientOrphans, setClientOrphans] = useState<OrphanGoogleEvent[]>(initialOrphans ?? []);
  const [currentGoogleStatus, setCurrentGoogleStatus] = useState<GoogleCalendarStatus | null>(googleStatus ?? null);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [googleCheckFailed, setGoogleCheckFailed] = useState(false);
  const googleRefreshRef = useRef<Promise<void> | null>(null);
  const [, startTransition] = useTransition();
  const newAppointmentDialogHandle = useMemo(() => Dialog.createHandle(), []);

  const baseDate = useMemo(() => fromDateKey(dateKey), [dateKey]);

  const refreshGoogleState = useCallback(() => {
    if (googleRefreshRef.current) return googleRefreshRef.current;

    setCheckingGoogle(true);
    setGoogleCheckFailed(false);

    const request = (async () => {
      try {
        const result = await refreshAgendaGoogleState();
        setCurrentGoogleStatus(result.status);
        setClientOrphans(result.orphanEvents);

        if (result.appointmentsChanged) router.refresh();
      } catch {
        setGoogleCheckFailed(true);
      } finally {
        setCheckingGoogle(false);
      }
    })();

    googleRefreshRef.current = request;
    void request.finally(() => {
      if (googleRefreshRef.current === request) googleRefreshRef.current = null;
    });
    return request;
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refreshGoogleState());
    return () => window.cancelAnimationFrame(frame);
  }, [view, dateKey, refreshGoogleState]);

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      void refreshGoogleState();
    }

    const timer = window.setInterval(refreshIfVisible, UI_REFRESH_MS);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [router, refreshGoogleState]);

  const localEventIds = useMemo(
    () =>
      new Set(
        appointments
          .map((appointment) => appointment.googleEventId)
          .filter((value): value is string => Boolean(value))
      ),
    [appointments]
  );

  const adoptingEventId =
    (modal?.mode === "create" ? modal.adoptGoogleEventId : null) ?? initialAdoptGoogleEventId ?? null;

  const orphans = useMemo(() => {
    return dedupeOrphans(clientOrphans).filter(
      (orphan) => {
        // No volver a mostrar toasts de orphans que ya estamos adoptando
        if (orphan.eventId === adoptingEventId) return false;
        return !localEventIds.has(orphan.eventId);
      }
    );
  }, [clientOrphans, localEventIds, adoptingEventId]);

  const toastedOrphansRef = useRef(new Set<string>());
  const previouslyDismissedOrphanIds = useRef(new Set<string>());

  useEffect(() => {
    const activeOrphanIds = new Set(orphans.map((orphan) => orphan.eventId));
    for (const eventId of toastedOrphansRef.current) {
      if (activeOrphanIds.has(eventId)) continue;
      toastManager.close(`orphan-${eventId}`);
      toastedOrphansRef.current.delete(eventId);
    }

    for (const orphan of orphans) {
      if (previouslyDismissedOrphanIds.current.has(orphan.eventId)) continue;

      if (toastedOrphansRef.current.has(orphan.eventId)) continue;
      toastedOrphansRef.current.add(orphan.eventId);

      const toastId = `orphan-${orphan.eventId}`;
      toastManager.add({
        id: toastId,
        title: orphan.title || "Evento sin asignar",
        description: formatEventRange(orphan.startTime, orphan.endTime),
        type: "info",
        data: { orphan },
        actionProps: {
          children: "Asignar",
          onClick: () => {
            const agendaUrl = buildAgendaAdoptionUrl(orphan);
            requestNavigation(() => {
              startNavigation("Abriendo evento...", agendaUrl);
              router.push(agendaUrl);
              toastManager.close(toastId);
            }, agendaUrl);
          }
        },
        onClose: () => {
          toastedOrphansRef.current.delete(orphan.eventId);
          previouslyDismissedOrphanIds.current.add(orphan.eventId);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orphans, adoptingEventId, router, requestNavigation, startNavigation]);

  const processedAdoptionRequestRef = useRef<string | null>(null);
  const adoptionRefreshAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    function clearAdoptionQuery() {
      const params = new URLSearchParams(window.location.search);
      params.delete("adopt");
      const query = params.toString();
      const target = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      router.replace(target, { scroll: false });
    }

    const requestedEventId = initialAdoptGoogleEventId;
    if (!requestedEventId) {
      processedAdoptionRequestRef.current = null;
      adoptionRefreshAttemptedRef.current = null;
      return;
    }
    if (processedAdoptionRequestRef.current === requestedEventId) return;

    const orphan = dedupeOrphans(clientOrphans).find(
      (item) => item.eventId === requestedEventId && !localEventIds.has(item.eventId)
    );
    if (orphan) {
      processedAdoptionRequestRef.current = requestedEventId;
      setModal({
        mode: "create",
        startTime: toDatetimeLocal(new Date(orphan.startTime)),
        endTime: toDatetimeLocal(new Date(orphan.endTime)),
        adoptGoogleEventId: orphan.eventId,
        title: orphan.title || "",
        description: orphan.description ?? ""
      });
      toastManager.close(`orphan-${requestedEventId}`);
      adoptionRefreshAttemptedRef.current = requestedEventId;
      clearAdoptionQuery();
      return;
    }

    if (checkingGoogle) {
      adoptionRefreshAttemptedRef.current = requestedEventId;
      return;
    }

    if (adoptionRefreshAttemptedRef.current !== requestedEventId) {
      adoptionRefreshAttemptedRef.current = requestedEventId;
      void refreshGoogleState();
      return;
    }

    processedAdoptionRequestRef.current = requestedEventId;
    toastManager.add({
      id: `orphan-adoption-missing-${requestedEventId}`,
      title: "No se pudo abrir el evento",
      description: googleCheckFailed
        ? "No se pudo verificar si el evento sigue disponible. Revisa la conexión con Google Calendar e inténtalo de nuevo."
        : "El evento sin asignar ya no está disponible. Actualiza la agenda e inténtalo de nuevo.",
      type: "info"
    });
    clearAdoptionQuery();
  }, [initialAdoptGoogleEventId, clientOrphans, localEventIds, checkingGoogle, googleCheckFailed, refreshGoogleState, router]);

  useEffect(() => {
    if (focusAppointmentId) {
      const appointment = appointments.find((item) => item.id === focusAppointmentId);
      if (appointment) {
        setModal({ mode: "edit", appointment });
      }
      return;
    }

    if (initialPatientId) {
      const start = fromDateKey(dateKey);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + DEFAULT_APPOINTMENT_MINUTES * 60 * 1000);
      setModal({ mode: "create", startTime: toDatetimeLocal(start), endTime: toDatetimeLocal(end), patientId: initialPatientId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildUrl = useCallback(
    (nextView: ScheduleView, nextDateKey: string) => {
      const agendaUrl = `/agenda?view=${nextView}&date=${nextDateKey}`;
      startNavigation("Cargando agenda...", agendaUrl);
      router.push(agendaUrl);
    },
    [router, startNavigation]
  );

  function handleNavigate(direction: 1 | -1) {
    const next =
      view === "day"
        ? addDays(baseDate, direction)
        : view === "week"
          ? addDays(baseDate, direction * 7)
          : addMonths(baseDate, direction);
    buildUrl(view, toDateKey(next));
  }

  function handleToday() {
    buildUrl(view, toDateKey(new Date()));
  }

  function handleViewChange(nextView: ScheduleView) {
    buildUrl(nextView, dateKey);
  }

  function handleSelectDay(dayKey: string) {
    buildUrl("day", dayKey);
  }

  function handleCreateOnDay(dayKey: string) {
    const start = fromDateKey(dayKey);
    start.setHours(9, 0, 0, 0);
    openCreateModal(start);
  }

  function handleCreateAt(point: TimelineCreatePoint) {
    const start = fromDateKey(point.dateKey);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(start.getMinutes() + point.minutes);
    openCreateModal(start);
  }

  function openCreateModal(start: Date) {
    const end = new Date(start.getTime() + DEFAULT_APPOINTMENT_MINUTES * 60 * 1000);
    setModal({ mode: "create", startTime: toDatetimeLocal(start), endTime: toDatetimeLocal(end) });
  }

  function handleEdit(appointment: AgendaAppointment) {
    setModal({ mode: "edit", appointment });
  }

  function handleHeaderNewAppointment() {
    const start = fromDateKey(dateKey);
    start.setHours(9, 0, 0, 0);
    openCreateModal(start);
  }

  function handleSyncAll() {
    setSyncing(true);
    setSyncResult(null);
    startTransition(async () => {
      try {
        const result = await syncAllAppointmentsToGoogle();
        setSyncResult(result);
        setClientOrphans(result.orphanEvents);
      } finally {
        setSyncing(false);
        router.refresh();
      }
    });
  }

  function handleModalChanged() {
    if (modal?.mode === "create" && modal.adoptGoogleEventId) {
      setClientOrphans((current) => current.filter((item) => item.eventId !== modal.adoptGoogleEventId));
      toastManager.close(`orphan-${modal.adoptGoogleEventId}`);
    }
    router.refresh();
    void refreshGoogleState();
  }

  return (
    <>
      <CalendarHeader
        view={view}
        dateKey={dateKey}
        syncStatus={currentGoogleStatus ?? undefined}
        checkingGoogle={checkingGoogle}
        googleCheckFailed={googleCheckFailed}
        onRetryGoogleCheck={refreshGoogleState}
        dialogHandle={newAppointmentDialogHandle}
        onNavigate={handleNavigate}
        onToday={handleToday}
        onViewChange={handleViewChange}
        onNewAppointment={handleHeaderNewAppointment}
        onSyncAll={handleSyncAll}
        isSyncing={syncing}
      />

      {syncResult ? <SyncResultBanner result={syncResult} syncing={syncing} /> : null}

      {view === "month" ? (
        <MonthView
          dateKey={dateKey}
          appointments={appointments}
          onSelectDay={handleSelectDay}
          onEditAppointment={handleEdit}
          onCreateInDay={handleCreateOnDay}
        />
      ) : view === "week" ? (
        <WeekView
          dateKey={dateKey}
          appointments={appointments}
          onCreateAt={handleCreateAt}
          onEdit={handleEdit}
          onSelectDay={handleSelectDay}
        />
      ) : (
        <DayView dateKey={dateKey} appointments={appointments} onCreateAt={handleCreateAt} onEdit={handleEdit} />
      )}

      {modal ? (
        <AppointmentModal
          open
          dialogHandle={newAppointmentDialogHandle}
          mode={modal.mode}
          appointment={modal.mode === "edit" ? modal.appointment : null}
          defaultStartTime={modal.mode === "create" ? modal.startTime : toDatetimeLocal(new Date())}
          defaultEndTime={modal.mode === "create" ? modal.endTime : toDatetimeLocal(addDays(new Date(), 1))}
          presetPatientId={modal.mode === "create" ? modal.patientId : undefined}
          adoptGoogleEventId={modal.mode === "create" ? modal.adoptGoogleEventId : undefined}
          presetTitle={modal.mode === "create" ? modal.title : undefined}
          presetDescription={modal.mode === "create" ? modal.description : undefined}
          patients={patients}
          onClose={() => setModal(null)}
          onChanged={handleModalChanged}
        />
      ) : null}
    </>
  );
}

function SyncResultBanner({ result, syncing }: { result: GoogleSyncSummary; syncing: boolean }) {
  if (!result.connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-coral-500/40 bg-coral-900/10 px-3 py-2 text-sm text-coral-400 dark:bg-transparent dark:text-ink-100">
        <span>{result.message ?? "No se pudo sincronizar con Google Calendar."}</span>
        <Button asChild variant="secondary" size="sm">
          <LoadingLink href="/settings" loadingLabel="Cargando ajustes...">
            Ir a Ajustes y reconectar
          </LoadingLink>
        </Button>
      </div>
    );
  }

  const failed = result.failed > 0;
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} creadas en Google`);
  if (result.updated > 0) parts.push(`${result.updated} actualizadas`);
  if (result.deleted > 0) parts.push(`${result.deleted} eliminadas`);
  if (result.failed > 0) parts.push(`${result.failed} con errores`);
  const untouched = result.total - result.created - result.updated - result.deleted - result.failed;
  if (!failed && untouched > 0) parts.push(`${untouched} sin cambios`);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm",
        failed
          ? "border-amber-500/40 bg-amber-950/50 text-amber-300"
          : "border-mint-500/40 bg-mint-900/50 text-mint-600 dark:text-ink-100"
      )}
    >
      <span>{syncing ? "Sincronizando..." : parts.length > 0 ? `Sincronización: ${parts.join(", ")}.` : "Sincronización al día."}</span>
      {result.message ? <span className="opacity-90">{result.message}</span> : null}
      {failed ? (
        <ul className="w-full space-y-1">
          {result.errors.map((error) => (
            <li key={error.id} className="text-xs">
              {error.title}: {error.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatEventRange(startValue: string, endValue: string) {
  const formatter = new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${formatter.format(new Date(startValue))} – ${formatter.format(new Date(endValue))}`;
}

function dedupeOrphans(orphans: OrphanGoogleEvent[]) {
  const seen = new Set<string>();
  const unique: OrphanGoogleEvent[] = [];
  for (const orphan of orphans) {
    if (seen.has(orphan.eventId)) continue;
    seen.add(orphan.eventId);
    unique.push(orphan);
  }
  return unique;
}
