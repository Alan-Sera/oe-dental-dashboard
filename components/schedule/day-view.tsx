"use client";

import { fromDateKey } from "@/lib/date-utils";
import { DayTimelineColumn, TimelineHourGutter, type TimelineCreatePoint } from "@/components/schedule/day-column";
import type { AgendaAppointment } from "@/components/schedule/types";

const FIRST_HOUR_HEIGHT_PX = 30;

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
        <TimelineHourGutter firstHourHeight={FIRST_HOUR_HEIGHT_PX} />
        <div className="flex-1">
          <div
            className="border-b border-lavender-500/45"
            style={{ height: FIRST_HOUR_HEIGHT_PX - 10 }}
            aria-hidden="true"
          />
          <DayTimelineColumn
            date={date}
            appointments={appointments}
            onCreateAt={onCreateAt}
            onEdit={onEdit}
            hourLineClassName="border-lavender-500/45"
            className="min-w-[420px]"
          />
        </div>
      </div>
    </div>
  );
}
