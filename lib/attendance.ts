import { parseLinkedTextHistory } from "@/lib/text-history-parser";
import { formatDate } from "@/lib/utils";

export type AttendanceItem = {
  key: string;
  entryId: string;
  appointmentIndex: number;
  appointmentNumber: number;
  dateText: string;
  normalizedDate: string | null;
  hasNoShow: boolean;
  hasNext: boolean;
};

export function getRecentAttendance(
  entries: Array<{ id: string; notes: string }>,
  limit = 4
): AttendanceItem[] {
  const all: AttendanceItem[] = entries.flatMap((entry) =>
    parseLinkedTextHistory(entry.notes).appointments.map((appointment, index) => ({
      key: `${entry.id}:${index}`,
      entryId: entry.id,
      appointmentIndex: index,
      appointmentNumber: index + 1,
      dateText: appointment.dateText,
      normalizedDate: appointment.normalizedDate,
      hasNoShow: appointment.hasNoShow,
      hasNext: appointment.hasNext || appointment.next.trim().length > 0
    }))
  );

  return all
    .sort((a, b) => {
      if (a.normalizedDate && b.normalizedDate) {
        return b.normalizedDate.localeCompare(a.normalizedDate);
      }
      if (a.normalizedDate) return -1;
      if (b.normalizedDate) return 1;
      return 0;
    })
    .slice(0, limit);
}

export function getAppointmentAnchor(item: Pick<AttendanceItem, "entryId" | "appointmentIndex">) {
  return `cita-${item.entryId}-${item.appointmentIndex}`;
}

export function getAppointmentNextAnchor(
  item: Pick<AttendanceItem, "entryId" | "appointmentIndex">
) {
  return `${getAppointmentAnchor(item)}-next`;
}

export function getWeekdayLabel(normalizedDate: string | null): string | null {
  if (!normalizedDate) return null;

  const date = new Date(`${normalizedDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  const raw = new Intl.DateTimeFormat("es", { weekday: "long" }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function describeNextAppointment(value: string | null | undefined): {
  weekday: string | null;
  label: string;
} | null {
  if (!value) return null;

  const dayPart = value.slice(0, 10);
  if (!dayPart) return null;

  return {
    weekday: getWeekdayLabel(dayPart),
    label: formatDate(`${dayPart}T12:00:00.000Z`)
  };
}
