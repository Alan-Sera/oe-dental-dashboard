export type AgendaAppointment = {
  id: string;
  patientId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  color: string | null;
  googleEventId: string | null;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
};

export type AgendaPatient = {
  id: string;
  fullName: string;
};

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  calendarScope: boolean;
};

export type OrphanGoogleEvent = {
  eventId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
};

export type GoogleSyncSummary = {
  connected: boolean;
  message?: string;
  total: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
  errors: { id: string; title: string; message: string }[];
  orphanEvents: OrphanGoogleEvent[];
};