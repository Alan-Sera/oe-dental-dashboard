"use client";

import { useMemo } from "react";

import { addDays, formatLongDate, formatWeekdayLetter, fromDateKey, isSameMonth, isToday, startOfWeek, toDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { DayTimelineColumn, TimelineHourGutter, type TimelineCreatePoint } from "@/components/schedule/day-column";
import type { AgendaAppointment } from "@/components/schedule/types";

export function WeekView({
  dateKey,
  appointments,
  onCreateAt,
  onEdit,
  onSelectDay
}: {
  dateKey: string;
  appointments: AgendaAppointment[];
  onCreateAt: (point: TimelineCreatePoint) => void;
  onEdit: (appointment: AgendaAppointment) => void;
  onSelectDay: (dateKey: string) => void;
}) {
  const referenceDate = fromDateKey(dateKey);
  const days = useMemo(() => {
    const start = startOfWeek(fromDateKey(dateKey));
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [dateKey]);

  return (
    <div className="panel">
      <div className="flex min-w-[680px]">
        <TimelineHourGutter />
        <div className="grid flex-1 grid-cols-7">
          {days.map((day) => {
            const dayKey = toDateKey(day);
            const today = isToday(day);
            const inMonth = isSameMonth(day, referenceDate);
            return (
              <div key={dayKey} className="min-w-0 border-l border-lavender-500/45 first:border-l-0">
                <div className="flex flex-col items-center gap-0.5 border-b border-lavender-500/45 pt-.5">
                  <span className="text-s font-semibold text-lavender-200/60">{formatWeekdayLetter(day)}</span>
                  <button
                    type="button"
                    aria-label={`Seleccionar día: ${formatLongDate(day)}`}
                    onClick={() => onSelectDay(dayKey)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm transition hover:bg-brand-50 dark:hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-400",
                      today
                        ? "bg-brand-600 font-semibold text-white hover:text-brand-800 hover:bg-brand-600 dark:hover:text-white"
                        : inMonth
                          ? "text-lavender-100 hover:text-brand-800 dark:hover:text-lavender-100 font-semibold"
                          : "text-lavender-200/40 hover:text-brand-800 dark:hover:text-lavender-200/40"
                    )}
                  >
                    {day.getDate()}
                  </button>
                </div>
                <DayTimelineColumn
                  date={day}
                  appointments={appointments}
                  onCreateAt={onCreateAt}
                  onEdit={onEdit}
                  showDetailsOnHover
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
