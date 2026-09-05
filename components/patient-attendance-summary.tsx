import { ArrowDownToLine, CalendarDays, CalendarX2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  describeNextAppointment,
  getWeekdayLabel,
  type AttendanceItem
} from "@/lib/attendance";
import { cn } from "@/lib/utils";

export function PatientNextAppointment({
  value,
  compact = false,
  className
}: {
  value: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const next = describeNextAppointment(value);

  if (!next) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-lavender-500/45 px-4 text-center",
          compact ? "py-3" : "py-4",
          className
        )}
      >
        <p className="text-sm font-medium text-lavender-100">Sin próxima cita programada</p>
        {!compact ? (
          <p className="mt-1 text-sm text-lavender-200/50">
            Se gestionará desde el módulo de agenda.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-emerald-300/40 bg-emerald-950/30",
        compact ? "p-2.5" : "p-3",
        className
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-800/60 text-emerald-100 ring-1 ring-emerald-300/30">
        <CalendarDays className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <Badge tone="mint">Próxima cita</Badge>
        <p className="mt-1 truncate text-sm font-semibold text-white">
          {next.weekday ? `${next.weekday} · ` : null}
          {next.label}
        </p>
      </div>
    </div>
  );
}

export function PatientAttendanceSummary({
  nextAppointmentDate,
  items,
  onViewNext,
  className
}: {
  nextAppointmentDate: string | null | undefined;
  items: AttendanceItem[];
  onViewNext?: (item: AttendanceItem) => void;
  className?: string;
}) {
  return (
    <section aria-label="Historial de asistencias" className={cn("space-y-4", className)}>
      <PatientNextAppointment value={nextAppointmentDate} />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-lavender-200/45">
          Últimas citas
        </p>
        {items.length > 0 ? (
          <ul aria-label="Últimas citas" className="space-y-2">
            {items.map((item) => {
              const weekday = getWeekdayLabel(item.normalizedDate);
              return (
                <li
                  key={item.key}
                  aria-label={`Cita ${item.appointmentNumber} ${item.dateText}${item.hasNoShow ? ", no asistió" : ""}${item.hasNext ? ", con NEXT" : ""}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-lavender-500/25 bg-lavender-950/18 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-lavender-200/45">
                      Cita {item.appointmentNumber}
                    </p>
                    <p className="truncate font-mono text-sm font-semibold text-white">
                      {item.dateText}
                    </p>
                    <p className="truncate text-xs text-lavender-200/55">
                      {weekday ?? "Fecha sin normalizar"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {item.hasNext ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit text-amber-200/80 hover:bg-amber-950/25 hover:text-amber-100"
                        aria-label={`Ver NEXT de cita ${item.appointmentNumber} ${item.dateText}`}
                        onClick={() => onViewNext?.(item)}
                      >
                        <ArrowDownToLine className="size-4" aria-hidden="true" />
                        Ver NEXT
                      </Button>
                    ) : null}
                    {item.hasNoShow ? (
                      <Badge tone="coral">
                        <CalendarX2 className="mr-1 size-3" aria-hidden="true" />
                        No asistió
                      </Badge>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-lavender-500/45 px-4 py-6 text-center">
            <p className="text-sm font-medium text-lavender-100">Sin citas en historia</p>
            <p className="mt-1 text-sm text-lavender-200/50">
              Las citas de la historia aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
