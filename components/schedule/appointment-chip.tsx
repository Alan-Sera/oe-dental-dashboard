"use client";

import type { MouseEvent } from "react";

import { CloudOff } from "lucide-react";

import { formatTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { AgendaAppointment } from "@/components/schedule/types";

const statusColors: Record<string, string> = {
  SCHEDULED: "border-lavender-400/30 bg-lavender-700/40 text-lavender-50 hover:bg-lavender-600/45",
  CONFIRMED: "border-brand-400/40 bg-brand-700/60 text-white hover:bg-brand-600/70",
  COMPLETED: "border-mint-500/40 bg-mint-900/50 text-mint-200 hover:bg-mint-800/60",
  CANCELLED: "border-coral-500/40 bg-coral-900/50 text-coral-300 hover:bg-coral-800/60",
  NO_SHOW: "border-amber-600/40 bg-amber-950/60 text-amber-300 hover:bg-amber-900/60"
};

const cancelledOpacity = "opacity-60";

export function AppointmentChip({
  appointment,
  showTime,
  showPatient,
  showSync,
  onClick,
  className
}: {
  appointment: AgendaAppointment;
  showTime?: boolean;
  showPatient?: boolean;
  showSync?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const start = new Date(appointment.startTime);
  const end = new Date(appointment.endTime);
  const cancelled = appointment.status === "CANCELLED";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-md border px-2 py-1 text-left text-xs leading-tight transition",
        statusColors[appointment.status] ?? statusColors.SCHEDULED,
        cancelled ? cancelledOpacity : undefined,
        className
      )}
    >
      <span className="block truncate font-medium">
        {showTime ? `${formatTime(start)} · ` : ""}
        {appointment.title}
        {showSync && !appointment.googleEventId ? (
          <>
            {" "}
            <CloudOff
              className="inline size-3 shrink-0 opacity-70"
              aria-label="Sin sincronizar con Google Calendar"
            />
          </>
        ) : null}
      </span>
      {showPatient ? <span className="block truncate opacity-80">{appointment.patientName}</span> : null}
      <span className="sr-only">Termina a las {formatTime(end)}</span>
    </button>
  );
}