"use client";

import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";

import {
  addDays,
  formatMonthYear,
  formatLongDate,
  fromDateKey,
  startOfWeek
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { ScheduleView } from "@/components/schedule/constants";
import { GoogleSyncBadge } from "@/components/schedule/google-sync-badge";
import type { GoogleCalendarStatus } from "@/components/schedule/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { DialogTrigger, type DialogHandle } from "@/components/ui/dialog";

const views: { value: ScheduleView; label: string }[] = [
  { value: "month", label: "Mes" },
  { value: "week", label: "Semana" },
  { value: "day", label: "Día" }
];

export function CalendarHeader({
  view,
  dateKey,
  syncStatus,
  dialogHandle,
  onNavigate,
  onToday,
  onViewChange,
  onNewAppointment,
  onSyncAll,
  isSyncing
}: {
  view: ScheduleView;
  dateKey: string;
  syncStatus?: GoogleCalendarStatus;
  dialogHandle?: DialogHandle;
  onNavigate: (direction: 1 | -1) => void;
  onToday: () => void;
  onViewChange: (view: ScheduleView) => void;
  onNewAppointment: () => void;
  onSyncAll?: () => void;
  isSyncing?: boolean;
}) {
  const date = fromDateKey(dateKey);
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);

  const title =
    view === "month"
      ? formatMonthYear(date)
      : view === "week"
        ? formatWeekRange(weekStart, weekEnd)
        : formatLongDate(date);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="section-title text-xl capitalize">{title}</h1>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Anterior" onClick={() => onNavigate(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onToday}>
            Hoy
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Siguiente" onClick={() => onNavigate(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {onSyncAll ? (
          <button
            type="button"
            onClick={onSyncAll}
            disabled={isSyncing}
            title={isSyncing ? "Sincronizando con Google Calendar..." : "Sincronizar todas las citas con Google Calendar"}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-400/45 bg-brand-900/60 px-3 text-xs font-medium text-brand-100 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} aria-hidden="true" />
            <span className="whitespace-nowrap">{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
          </button>
        ) : null}
        {syncStatus ? <GoogleSyncBadge status={syncStatus} /> : null}
        <div className="flex rounded-md border border-lavender-500/50 bg-lavender-900/40 p-0.5" role="tablist">
          {views.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={view === item.value}
              onClick={() => onViewChange(item.value)}
              className={cn(
                "h-8 rounded px-3 text-xs font-medium transition",
                view === item.value
                  ? "bg-brand-600 text-white shadow"
                  : "text-lavender-200/75 hover:text-lavender-50"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <DialogTrigger
          handle={dialogHandle}
          onClick={onNewAppointment}
          className={cn(buttonVariants())}
        >
          <Plus className="size-4" aria-hidden="true" />
          Nueva cita
        </DialogTrigger>
      </div>
    </div>
  );
}

function formatWeekRange(start: Date, end: Date) {
  return `${start.getDate()} – ${end.getDate()} de ${formatMonthYear(start)}`;
}