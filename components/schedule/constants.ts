export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 21;

export const WORKDAY_START_MINUTES = WORKDAY_START_HOUR * 60;
export const WORKDAY_END_MINUTES = WORKDAY_END_HOUR * 60;
export const WORKDAY_TOTAL_MINUTES = WORKDAY_END_MINUTES - WORKDAY_START_MINUTES;

export const HOUR_HEIGHT_PX = 56;

export const DEFAULT_APPOINTMENT_MINUTES = 60;

export const appointmentStatusLabels: Record<string, string> = {
  SCHEDULED: "Programada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió"
};

export const appointmentStatusTones: Record<string, "neutral" | "brand" | "mint" | "amber" | "coral" | "sky"> = {
  SCHEDULED: "neutral",
  CONFIRMED: "brand",
  COMPLETED: "mint",
  CANCELLED: "coral",
  NO_SHOW: "amber"
};

export type ScheduleView = "month" | "week" | "day";