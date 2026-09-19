"use client";

import { useMemo } from "react";

import { addDays, formatWeekdayLetter, fromDateKey, isToday, startOfWeek, toDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { DayTimelineColumn, TimelineHourGutter, type TimelineCreatePoint } from "@/components/schedule/day-column";
import type { AgendaAppointment } from "@/components/schedule/types";

export function WeekView({
  dateKey,
  appointments,
  onCreateAt,
  onEdit
}: {
  dateKey: string;
  appointments: AgendaAppointment[];
  onCreateAt: (point: TimelineCreatePoint) => void;
  onEdit: (appointment: AgendaAppointment) => void;
}) {
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
            return (
              <div key={dayKey} className="min-w-0 border-l border-lavender-500/45 first:border-l-0">
                <div className="flex flex-col items-center gap-0.5 border-b border-lavender-500/45 pt-.5">
                  <span className="text-xs text-lavender-200/60">{formatWeekdayLetter(day)}</span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm",
                      today ? "bg-brand-600 font-semibold text-white" : "text-lavender-100"
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <DayTimelineColumn date={day} appointments={appointments} onCreateAt={onCreateAt} onEdit={onEdit} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}