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

export type GoogleCalendarColor = {
  id: string;
  name: string;
  hex: string;
  chipClass: string;
};

export const GOOGLE_CALENDAR_COLORS: GoogleCalendarColor[] = [
  { id: "1", name: "Lavanda", hex: "#7986cb", chipClass: "border-[#7986cb] bg-[#7986cb]/20 text-[#c5cae9]" },
  { id: "2", name: "Salvia", hex: "#33b679", chipClass: "border-[#33b679] bg-[#33b679]/20 text-[#a5d6a7]" },
  { id: "3", name: "Uva", hex: "#8e24aa", chipClass: "border-[#8e24aa] bg-[#8e24aa]/20 text-[#ce93d8]" },
  { id: "4", name: "Flamingo", hex: "#e67c73", chipClass: "border-[#e67c73] bg-[#e67c73]/20 text-[#f8bbd0]" },
  { id: "5", name: "Plátano", hex: "#f6bf26", chipClass: "border-[#f6bf26] bg-[#f6bf26]/20 text-[#fff9c4]" },
  { id: "6", name: "Naranja", hex: "#f4511e", chipClass: "border-[#f4511e] bg-[#f4511e]/20 text-[#ffccbc]" },
  { id: "7", name: "Pavo real", hex: "#039be5", chipClass: "border-[#039be5] bg-[#039be5]/20 text-[#b3e5fc]" },
  { id: "8", name: "Grafito", hex: "#616161", chipClass: "border-[#616161] bg-[#616161]/20 text-[#bdbdbd]" },
  { id: "9", name: "Azul bay", hex: "#3f51b5", chipClass: "border-[#3f51b5] bg-[#3f51b5]/20 text-[#c5cae9]" },
  { id: "10", name: "Romero", hex: "#0b8043", chipClass: "border-[#0b8043] bg-[#0b8043]/20 text-[#a5d6a7]" },
  { id: "11", name: "Tomate", hex: "#d50000", chipClass: "border-[#d50000] bg-[#d50000]/20 text-[#ef9a9a]" }
];

export function getGoogleCalendarColor(colorId: string | null | undefined): GoogleCalendarColor | undefined {
  if (!colorId) return undefined;
  return GOOGLE_CALENDAR_COLORS.find((c) => c.id === colorId);
}