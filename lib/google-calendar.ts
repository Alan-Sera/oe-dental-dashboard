import "server-only";

import { google } from "googleapis";
import { getGoogleOAuthConfig, isGoogleReconnectRequiredError, refreshGoogleAccessToken } from "@/lib/google-drive";
import { getGoogleRefreshToken } from "@/lib/google-settings";

const CALENDAR_ID = "primary";
const MAX_EVENTS_PER_REQUEST = 2500;

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  colorId?: string | null;
  attendees?: { email: string; name?: string }[];
};

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  start: Date;
  end: Date;
  colorId: string | null;
};

const GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE =
  "La cuenta de Google no está conectada con permiso de Calendar. Reconecta Google para continuar.";

export class GoogleCalendarNotConnectedError extends Error {
  constructor(message?: string) {
    super(message ?? GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE);
    this.name = "GoogleCalendarNotConnectedError";
  }
}

export function isGoogleCalendarNotConnectedError(error: unknown) {
  return error instanceof GoogleCalendarNotConnectedError;
}

async function getCalendarOAuthClient() {
  const config = getGoogleOAuthConfig();
  if (!config) throw new GoogleCalendarNotConnectedError();

  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) throw new GoogleCalendarNotConnectedError();

  const accessToken = await refreshGoogleAccessToken(config, refreshToken);

  const client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  client.setCredentials({ access_token: accessToken });

  return client;
}

export async function createGoogleCalendarEvent(input: GoogleCalendarEventInput): Promise<{ id: string }> {
  const auth = await getCalendarOAuthClient();

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: "all",
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startTime.toISOString() },
        end: { dateTime: input.endTime.toISOString() },
        ...(input.colorId ? { colorId: input.colorId } : {}),
        attendees: input.attendees
      }
    });

    if (!response.data.id) {
      throw new Error("Google Calendar no devolvió un id de evento");
    }

    return { id: response.data.id };
  } catch (error) {
    throw normalizeCalendarError(error);
  }
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  input: GoogleCalendarEventInput
): Promise<{ id: string }> {
  const auth = await getCalendarOAuthClient();

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      sendUpdates: "all",
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startTime.toISOString() },
        end: { dateTime: input.endTime.toISOString() },
        ...(input.colorId ? { colorId: input.colorId } : {}),
        attendees: input.attendees
      }
    });

    if (!response.data.id) {
      throw new Error("Google Calendar no devolvió un id de evento");
    }

    return { id: response.data.id };
  } catch (error) {
    throw normalizeCalendarError(error);
  }
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const auth = await getCalendarOAuthClient();

  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
      sendUpdates: "all"
    });
  } catch (error) {
    if (isEventAlreadyDeleted(error)) return;
    throw normalizeCalendarError(error);
  }
}

function isEventAlreadyDeleted(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { response?: { status?: number } };
  return candidate.response?.status === 404;
}

export async function listGoogleCalendarEvents(start: Date, end: Date): Promise<GoogleCalendarEvent[]> {
  const auth = await getCalendarOAuthClient();

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: MAX_EVENTS_PER_REQUEST
    });

    const items = response.data.items ?? [];
    const events: GoogleCalendarEvent[] = [];

    for (const item of items) {
      if (item.status === "cancelled") continue;
      const eventStart = parseEventDate(item.start?.dateTime ?? item.start?.date);
      const eventEnd = parseEventDate(item.end?.dateTime ?? item.end?.date);
      if (!item.id || !eventStart || !eventEnd) continue;

      events.push({
        id: item.id,
        summary: item.summary ?? "",
        description: item.description ?? null,
        start: eventStart,
        end: eventEnd,
        colorId: item.colorId ?? null
      });
    }

    return events;
  } catch (error) {
    throw normalizeCalendarError(error);
  }
}

function parseEventDate(value: string | undefined | null): Date | null {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCalendarError(error: unknown): unknown {
  if (isGoogleReconnectRequiredError(error)) return error;

  const detail = getGoogleApiErrorDetail(error);
  if (!detail) return error;

  if (detail.reason === "accessNotConfigured") {
    return new GoogleCalendarNotConnectedError(
      "La API de Google Calendar no está activada para este proyecto. Actívala en Google Cloud Console en “APIs y servicios → Biblioteca → Google Calendar API”."
    );
  }

  if (detail.reason === "insufficientPermissions" || /insufficient\s+authentication\s+scopes/i.test(detail.message ?? "")) {
    return new GoogleCalendarNotConnectedError(
      "El acceso a Google no tiene el permiso de Calendar. Reconecta Google desde Ajustes y acepta el permiso de calendario."
    );
  }

  return new GoogleCalendarNotConnectedError(
    detail.message ? `${GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE} Detalle: ${detail.message}` : GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE
  );
}

function getGoogleApiErrorDetail(error: unknown): { reason?: string; message?: string } | null {
  if (typeof error !== "object" || error === null) return null;

  const candidate = error as {
    response?: {
      status?: number;
      data?: { error?: { message?: string; errors?: { reason?: string }[] } };
    };
  };
  const responseError = candidate.response?.data?.error;
  if (candidate.response?.status !== 403 || !responseError) return null;

  return {
    reason: responseError.errors?.[0]?.reason,
    message: responseError.message
  };
}