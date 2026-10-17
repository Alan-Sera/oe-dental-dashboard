import type { AppointmentStatus } from "@prisma/client";

export const UPCOMING_APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED"
] satisfies readonly AppointmentStatus[];

export function getUpcomingAppointmentWhere(asOf: Date) {
  return {
    startTime: { gte: asOf },
    status: { in: [...UPCOMING_APPOINTMENT_STATUSES] }
  };
}
