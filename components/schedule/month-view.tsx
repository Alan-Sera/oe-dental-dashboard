"use client";

import { useMemo } from "react";

import { addDays, fromDateKey, isSameMonth, isToday, toDateKey, formatWeekdayLetter } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { AppointmentChip } from "@/components/schedule/appointment-chip";
import type { AgendaAppointment } from "@/components/schedule/types";

export function MonthView({
  dateKey,
  appointments,
  onSelectDay,
  onEditAppointment,
  onCreateInDay
}: {
  dateKey: string;
  appointments: AgendaAppointment[];
  onSelectDay: (dateKey: string) => void;
  onEditAppointment: (appointment: AgendaAppointment) => void;
  onCreateInDay: (dateKey: string) => void;
}) {
  const reference = fromDateKey(dateKey);
  const cells = useMemo(() => buildMonthMatrix(reference), [reference]);

  const grouped = useMemo(() => groupByDay(appointments), [appointments]);

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b border-lavender-500/45">
        {cells.slice(0, 7).map((day) => (
          <div key={toDateKey(day)} className="px-2 py-2 text-center text-xs font-medium uppercase text-lavender-200/60">
            {formatWeekdayLetter(day)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const dayKey = toDateKey(day);
          const dayLooksToday = isToday(day);
          const inMonth = isSameMonth(day, reference);
          const dayAppointments = grouped.get(dayKey) ?? [];
          const visible = dayAppointments.slice(0, 3);
          const extra = dayAppointments.length - visible.length;

          return (
            <div
              key={dayKey}
              className="group relative min-h-24 border-b border-r border-lavender-600/45 p-1.5 text-left transition hover:bg-lavender-800/30 last:border-r-0 [&:nth-child(7n)]:border-r-0"
            >
              <div className="mb-1 flex items-center justify-between px-0.5">
                <button
                  type="button"
                  onClick={() => onSelectDay(dayKey)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs transition hover:bg-brand-800",
                    dayLooksToday
                      ? "bg-brand-600 font-semibold text-white"
                      : inMonth
                        ? "text-lavender-100"
                        : "text-lavender-200/40"
                  )}
                >
                  {day.getDate()}
                </button>
                <button
                  type="button"
                  aria-label="Nueva cita este día"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateInDay(dayKey);
                  }}
                  className="mr-0.5 rounded px-1.5 text-xs font-medium text-brand-300 opacity-0 transition hover:bg-brand-900 hover:text-white group-hover:opacity-100"
                >
                  +
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {visible.map((appointment) => (
                  <AppointmentChip
                    key={appointment.id}
                    appointment={appointment}
                    showTime
                    showSync
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditAppointment(appointment);
                    }}
                  />
                ))}
                {extra > 0 ? (
                  <span className="px-1 text-xs text-lavender-200/60">+{extra} más</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildMonthMatrix(reference: Date): Date[] {
  const firstOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const weekday = firstOfMonth.getDay();
  const startOffset = -weekday;
  const start = addDays(firstOfMonth, startOffset);

  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function groupByDay(appointments: AgendaAppointment[]) {
  const map = new Map<string, AgendaAppointment[]>();
  for (const appointment of appointments) {
    const key = toDateKey(new Date(appointment.startTime));
    const list = map.get(key);
    if (list) list.push(appointment);
    else map.set(key, [appointment]);
  }
  return map;
}