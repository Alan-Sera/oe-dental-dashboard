import { toDateKey } from "@/lib/date-utils";

export function buildAgendaAdoptionUrl(event: { eventId: string; startTime: string }): string {
  const dateKey = toDateKey(new Date(event.startTime));
  return `/agenda?view=day&date=${dateKey}&adopt=${encodeURIComponent(event.eventId)}`;
}
