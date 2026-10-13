"use client";

import type { MouseEvent } from "react";

import { CloudOff } from "lucide-react";

import { formatTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { getGoogleCalendarColor } from "@/components/schedule/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgendaAppointment } from "@/components/schedule/types";

const statusColors: Record<string, string> = {
  SCHEDULED: "border-lavender-400/30 bg-lavender-700/40 text-lavender-50 hover:bg-lavender-600/45",
  CONFIRMED: "border-brand-400/40 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-700/60 dark:text-white dark:hover:bg-brand-600/70",
  COMPLETED: "border-mint-500/40 bg-mint-900/50 text-mint-600 hover:bg-mint-800/60 dark:text-ink-200",
  CANCELLED: "border-coral-500/40 bg-coral-900/50 text-coral-400 hover:bg-coral-800/60 dark:text-ink-100",
  NO_SHOW: "border-amber-600/40 bg-amber-950/60 text-amber-300 hover:bg-amber-900/60"
};

const cancelledOpacity = "opacity-60";

export function AppointmentChip({
  appointment,
  showTime,
  showPatient,
  showSync,
  showDetailsOnHover = false,
  wrapText = false,
  onClick,
  className
}: {
  appointment: AgendaAppointment;
  showTime?: boolean;
  showPatient?: boolean;
  showSync?: boolean;
  showDetailsOnHover?: boolean;
  wrapText?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const start = new Date(appointment.startTime);
  const end = new Date(appointment.endTime);
  const cancelled = appointment.status === "CANCELLED";

  const colorDef = getGoogleCalendarColor(appointment.color);
  const colorStyle = colorDef
    ? { borderLeftColor: colorDef.hex, borderLeftWidth: "3px" }
    : undefined;
  const fullText = [
    showTime ? formatTime(start) : null,
    appointment.title,
    showPatient || showDetailsOnHover ? appointment.patientName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const chip = (
    <button
      type="button"
      onClick={onClick}
      style={colorStyle}
      className={cn(
        "block w-full rounded-md border py-1 text-left text-xs leading-tight transition",
        wrapText ? "overflow-hidden px-1" : "px-2",
        colorDef ? cn(colorDef.chipClass, colorDef.lightTextClass) : statusColors[appointment.status] ?? statusColors.SCHEDULED,
        cancelled ? cancelledOpacity : undefined,
        className
      )}
    >
      <span className={cn("block font-medium", wrapText ? "whitespace-normal break-words" : "truncate")}>
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
      {showPatient ? (
        <span className={cn("block opacity-80", wrapText ? "whitespace-normal break-words" : "truncate")}>
          {appointment.patientName}
        </span>
      ) : null}
      <span className="sr-only">Termina a las {formatTime(end)}</span>
    </button>
  );

  if (!wrapText && !showDetailsOnHover) return chip;

  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent className="max-w-sm whitespace-normal text-base leading-snug">
        <span className="block whitespace-normal">{fullText}</span>
      </TooltipContent>
    </Tooltip>
  );
}
