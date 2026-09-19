"use client";

import { useEffect, useRef, useState } from "react";

import { formatTime, toDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  HOUR_HEIGHT_PX,
  WORKDAY_END_HOUR,
  WORKDAY_START_HOUR,
  WORKDAY_START_MINUTES,
  WORKDAY_TOTAL_MINUTES,
} from "@/components/schedule/constants";
import { AppointmentChip } from "@/components/schedule/appointment-chip";
import type { AgendaAppointment } from "@/components/schedule/types";

export type TimelineCreatePoint = { dateKey: string; minutes: number };

const hours = Array.from(
  { length: WORKDAY_END_HOUR - WORKDAY_START_HOUR + 1 },
  (_, index) => WORKDAY_START_HOUR + index,
);
const totalHeightPx = (WORKDAY_END_HOUR - WORKDAY_START_HOUR) * HOUR_HEIGHT_PX;
const roundToHalfHour = (minutes: number) =>
  Math.min(
    Math.max(Math.floor(minutes / 30) * 30, WORKDAY_START_MINUTES),
    WORKDAY_START_MINUTES + WORKDAY_TOTAL_MINUTES - 30,
  );

export function DayTimelineColumn({
  date,
  appointments,
  onCreateAt,
  onEdit,
  className,
}: {
  date: Date;
  appointments: AgendaAppointment[];
  onCreateAt: (point: TimelineCreatePoint) => void;
  onEdit: (appointment: AgendaAppointment) => void;
  className?: string;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const dateKey = toDateKey(date);
  const dayAppointments = appointments.filter(
    (appointment) => toDateKey(new Date(appointment.startTime)) === dateKey,
  );

  function handleEmptyClick(offsetRatio: number) {
    const minutes = WORKDAY_START_MINUTES + offsetRatio * WORKDAY_TOTAL_MINUTES;
    onCreateAt({ dateKey, minutes: roundToHalfHour(minutes) });
  }

  return (
    <div className={cn("relative bg-lavender-900/10", className)}>
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ height: totalHeightPx }}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute inset-x-0 border-t border-lavender-600/40"
            style={{ top: (hour - WORKDAY_START_HOUR) * HOUR_HEIGHT_PX }}
          />
        ))}
      </div>

      <div
        ref={columnRef}
        className="relative"
        style={{ height: totalHeightPx }}
        onClick={(event) => {
          const rect = columnRef.current?.getBoundingClientRect();
          if (!rect) return;
          const ratio = (event.clientY - rect.top) / rect.height;
          handleEmptyClick(ratio);
        }}
      >
        <CurrentTimeIndicator date={date} />

        {dayAppointments.map((appointment) => {
          const start = new Date(appointment.startTime);
          const top = positionTop(start);
          const height = positionHeight(
            appointment.startTime,
            appointment.endTime,
          );

          return (
            <div
              key={appointment.id}
              className="absolute left-1 right-1 z-20 min-w-0"
              style={{ top: `${top}%`, height: `${height}%` }}
            >
              <AppointmentChip
                appointment={appointment}
                showTime
                showPatient
                showSync
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(appointment);
                }}
                className="h-full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ date }: { date: Date }) {
  const [now, setNow] = useState(() => new Date());
  const columnDateKey = toDateKey(date);
  const todayKey = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  if (
    columnDateKey !== todayKey ||
    nowMinutes < WORKDAY_START_MINUTES ||
    nowMinutes > WORKDAY_START_MINUTES + WORKDAY_TOTAL_MINUTES
  ) {
    return null;
  }

  const top =
    ((nowMinutes - WORKDAY_START_MINUTES) / WORKDAY_TOTAL_MINUTES) * 100;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top: `${top}%` }}
    >
      <div className="absolute left-0 right-0 h-px -translate-y-1/2 bg-coral-400 shadow-[0_0_8px_rgba(244,114,99,0.45)]" />
      <div className="absolute -left-1.5 top-0 size-3 -translate-y-1/2 rounded-full bg-coral-400 shadow-[0_0_10px_rgba(244,114,99,0.6)]" />
    </div>
  );
}

function positionTop(start: Date) {
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  return (
    ((Math.max(startMinutes, WORKDAY_START_MINUTES) - WORKDAY_START_MINUTES) /
      WORKDAY_TOTAL_MINUTES) *
    100
  );
}

function positionHeight(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const startMinutes = Math.max(
    start.getHours() * 60 + start.getMinutes(),
    WORKDAY_START_MINUTES,
  );
  const endMinutes = Math.min(
    end.getHours() * 60 + end.getMinutes(),
    WORKDAY_START_MINUTES + WORKDAY_TOTAL_MINUTES,
  );
  return Math.max(
    ((endMinutes - startMinutes) / WORKDAY_TOTAL_MINUTES) * 100,
    2.5,
  );
}

export function TimelineHourGutter() {
  return (
    <div
      className="shrink-0 text-right"
      style={{ height: totalHeightPx }}
      aria-hidden="true"
    >
      {hours.map((hour) => (
        <div
          key={hour}
          className="flex items-end justify-end pr-2 text-xs text-lavender-200/50"
          style={{ height: HOUR_HEIGHT_PX }}
        >
          {formatTime(new Date(2000, 0, 1, hour))}
        </div>
      ))}
    </div>
  );
}
