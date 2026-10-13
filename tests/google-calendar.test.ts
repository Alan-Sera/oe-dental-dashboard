import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { eventsInsert, eventsPatch, eventsGet, eventsDelete } = vi.hoisted(() => ({
  eventsInsert: vi.fn(),
  eventsPatch: vi.fn(),
  eventsGet: vi.fn(),
  eventsDelete: vi.fn()
}));

vi.mock("server-only", () => ({}));

vi.mock("googleapis", () => {
  class OAuth2 {
    setCredentials() {}
  }

  return {
    google: {
      auth: { OAuth2 },
      calendar: () => ({ events: { insert: eventsInsert, patch: eventsPatch, get: eventsGet, delete: eventsDelete } })
    }
  };
});

vi.mock("@/lib/google-drive", () => ({
  getGoogleOAuthConfig: () => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost/callback",
    tokenEncryptionKey: "test-key"
  }),
  isGoogleReconnectRequiredError: () => false,
  refreshGoogleAccessToken: async () => "access-token"
}));

vi.mock("@/lib/google-settings", () => ({
  getGoogleRefreshToken: async () => "refresh-token"
}));

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent
} from "@/lib/google-calendar";

const eventInput = {
  summary: "Cita de revisión",
  description: "Control",
  startTime: new Date("2026-10-12T15:00:00.000Z"),
  endTime: new Date("2026-10-12T15:30:00.000Z"),
  colorId: "5"
};

beforeEach(() => {
  eventsInsert.mockReset();
  eventsPatch.mockReset();
  eventsGet.mockReset();
  eventsDelete.mockReset();
  eventsInsert.mockResolvedValue({ data: { id: "event-123", colorId: eventInput.colorId } });
  eventsPatch.mockResolvedValue({ data: { id: "event-123", colorId: eventInput.colorId } });
  eventsGet.mockResolvedValue({ data: { id: "event-123", colorId: eventInput.colorId } });
  eventsDelete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateGoogleCalendarEvent", () => {
  it("updates the existing event, clears attendees, avoids routine notifications, and verifies the stored color", async () => {
    await expect(updateGoogleCalendarEvent("event-123", eventInput)).resolves.toEqual({ id: "event-123" });

    expect(eventsPatch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "event-123",
      eventLabelVersion: 0,
      sendUpdates: "none",
      requestBody: {
        summary: eventInput.summary,
        description: eventInput.description,
        start: { dateTime: eventInput.startTime.toISOString() },
        end: { dateTime: eventInput.endTime.toISOString() },
        colorId: eventInput.colorId,
        attendees: []
      }
    });
    expect(eventsGet).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "event-123",
      fields: "id,colorId"
    });
  });

  it("notifies current guests once when removing attendees during the cleanup", async () => {
    await updateGoogleCalendarEvent("event-123", eventInput, "all");

    expect(eventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sendUpdates: "all",
        requestBody: expect.objectContaining({ attendees: [] })
      })
    );
  });

  it("accepts the color confirmed by the persisted event even if PATCH returns a different color", async () => {
    eventsPatch.mockResolvedValueOnce({ data: { id: "event-123", colorId: "2" } });

    await expect(updateGoogleCalendarEvent("event-123", eventInput)).resolves.toEqual({ id: "event-123" });
  });

  it("reports the color actually persisted by Google when it differs", async () => {
    eventsGet.mockResolvedValueOnce({ data: { id: "event-123", colorId: "2" } });

    await expect(updateGoogleCalendarEvent("event-123", eventInput)).rejects.toThrow(
      "Google Calendar no confirmó el color seleccionado (solicitado: 5, recibido: 2)"
    );
  });
});

describe("Google Calendar guest handling", () => {
  it("creates events with a color but without attendees or notifications", async () => {
    await expect(createGoogleCalendarEvent(eventInput)).resolves.toEqual({ id: "event-123" });

    expect(eventsInsert).toHaveBeenCalledWith({
      calendarId: "primary",
      eventLabelVersion: 0,
      sendUpdates: "none",
      requestBody: {
        summary: eventInput.summary,
        description: eventInput.description,
        start: { dateTime: eventInput.startTime.toISOString() },
        end: { dateTime: eventInput.endTime.toISOString() },
        colorId: eventInput.colorId
      }
    });
  });

  it("deletes events without notifications by default", async () => {
    await deleteGoogleCalendarEvent("event-123");

    expect(eventsDelete).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "event-123",
      sendUpdates: "none"
    });
  });

  it("can send removal notifications during the one-time cleanup", async () => {
    await deleteGoogleCalendarEvent("event-123", "all");

    expect(eventsDelete).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "event-123",
      sendUpdates: "all"
    });
  });
});
