"use client";

import { fromDateKey } from "@/lib/date-utils";
import { DayTimelineColumn, TimelineHourGutter, type TimelineCreatePoint } from "@/components/schedule/day-column";
import { HOUR_HEIGHT_PX } from "@/components/schedule/constants";
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
      <div className="flex">
        <TimelineHourGutter />
        <div className="flex-1">
          <div
            className="border-b border-lavender-500/45"
            style={{ height: HOUR_HEIGHT_PX }}
            aria-hidden="true"
          />
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
