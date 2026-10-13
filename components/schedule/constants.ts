export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 21;

export const WORKDAY_START_MINUTES = WORKDAY_START_HOUR * 60;
export const WORKDAY_END_MINUTES = WORKDAY_END_HOUR * 60;
export const WORKDAY_TOTAL_MINUTES = WORKDAY_END_MINUTES - WORKDAY_START_MINUTES;

export const HOUR_HEIGHT_PX = 90;

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

export type GoogleCalendarColor = {
  id: string;
  name: string;
  hex: string;
  chipClass: string;
  lightTextClass: string;
};

export const GOOGLE_CALENDAR_COLORS: GoogleCalendarColor[] = [
  { id: "1", name: "Lavanda", hex: "#7986cb", chipClass: "border-[#7986cb] bg-[#7986cb]/20 dark:text-[#c5cae9]", lightTextClass: "text-[#3730a3]" },
  { id: "2", name: "Salvia", hex: "#33b679", chipClass: "border-[#33b679] bg-[#33b679]/20 dark:text-[#a5d6a7]", lightTextClass: "text-[#166534]" },
  { id: "3", name: "Uva", hex: "#8e24aa", chipClass: "border-[#8e24aa] bg-[#8e24aa]/20 dark:text-[#ce93d8]", lightTextClass: "text-[#6b21a8]" },
  { id: "4", name: "Flamingo", hex: "#e67c73", chipClass: "border-[#e67c73] bg-[#e67c73]/20 dark:text-[#f8bbd0]", lightTextClass: "text-[#9f1239]" },
  { id: "5", name: "Plátano", hex: "#f6bf26", chipClass: "border-[#f6bf26] bg-[#f6bf26]/20 dark:text-[#fff9c4]", lightTextClass: "text-[#854d0e]" },
  { id: "6", name: "Naranja", hex: "#f4511e", chipClass: "border-[#f4511e] bg-[#f4511e]/20 dark:text-[#ffccbc]", lightTextClass: "text-[#9a3412]" },
  { id: "7", name: "Pavo real", hex: "#039be5", chipClass: "border-[#039be5] bg-[#039be5]/20 dark:text-[#b3e5fc]", lightTextClass: "text-[#075985]" },
  { id: "8", name: "Grafito", hex: "#616161", chipClass: "border-[#616161] bg-[#616161]/20 dark:text-[#bdbdbd]", lightTextClass: "text-[#374151]" },
  { id: "9", name: "Azul bay", hex: "#3f51b5", chipClass: "border-[#3f51b5] bg-[#3f51b5]/20 dark:text-[#c5cae9]", lightTextClass: "text-[#1e3a8a]" },
  { id: "10", name: "Romero", hex: "#0b8043", chipClass: "border-[#0b8043] bg-[#0b8043]/20 dark:text-[#a5d6a7]", lightTextClass: "text-[#14532d]" },
  { id: "11", name: "Tomate", hex: "#d50000", chipClass: "border-[#d50000] bg-[#d50000]/20 dark:text-[#ef9a9a]", lightTextClass: "text-[#991b1b]" }
];

export function getGoogleCalendarColor(colorId: string | null | undefined): GoogleCalendarColor | undefined {
  if (!colorId) return undefined;
  return GOOGLE_CALENDAR_COLORS.find((c) => c.id === colorId);
}
