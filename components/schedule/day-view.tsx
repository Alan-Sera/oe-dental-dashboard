"use client";

import { formatLongDate, fromDateKey } from "@/lib/date-utils";
import { DayTimelineColumn, TimelineHourGutter, type TimelineCreatePoint } from "@/components/schedule/day-column";
import type { AgendaAppointment } from "@/components/schedule/types";

export function DayView({
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
  const date = fromDateKey(dateKey);

  return (
    <div className="panel p-3">
      <div className="mb-3 capitalize text-sm text-lavender-200/70">{formatLongDate(date)}</div>
      <div className="flex">
        <TimelineHourGutter />
        <div className="flex-1 overflow-x-auto">
          <DayTimelineColumn
            date={date}
            appointments={appointments}
            onCreateAt={onCreateAt}
            onEdit={onEdit}
            className="min-w-[420px]"
          />
        </div>
      </div>
    </div>
  );
}