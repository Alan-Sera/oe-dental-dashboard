import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, { key: string; value: string; updatedAt?: Date }>(),
  remoteEventsWithGuests: new Set<string>(),
  removalNotifications: new Map<string, number>(),
  failNextUpdateFor: new Set<string>(),
  appointments: [] as Array<Record<string, unknown>>,
  updateCalls: [] as Array<{ eventId: string; input: unknown; sendUpdates: string }>,
  googleUpdate: vi.fn(),
  googleList: vi.fn(),
  googleCreate: vi.fn(),
  googleDelete: vi.fn(),
  getConnectionStatus: vi.fn(),
  recordAudit: vi.fn(),
  appointmentFindMany: vi.fn(),
  appointmentFindFirst: vi.fn(),
  appointmentFindUnique: vi.fn(),
  appointmentCreate: vi.fn(),
  appointmentUpdate: vi.fn(),
  patientFindUnique: vi.fn(),
  patientUpdate: vi.fn(),
  settingFindUnique: vi.fn(),
  settingUpsert: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findMany: mocks.appointmentFindMany,
      findFirst: mocks.appointmentFindFirst,
      findUnique: mocks.appointmentFindUnique,
      create: mocks.appointmentCreate,
      update: mocks.appointmentUpdate
    },
    patient: {
      findUnique: mocks.patientFindUnique,
      update: mocks.patientUpdate
    },
    setting: {
      findUnique: mocks.settingFindUnique,
      upsert: mocks.settingUpsert
    }
  }
}));

vi.mock("@/lib/actions/audit.actions", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/google-drive", () => ({ isGoogleReconnectRequiredError: () => false }));
vi.mock("@/lib/google-settings", () => ({ getGoogleConnectionStatus: mocks.getConnectionStatus }));
vi.mock("@/lib/google-calendar", () => ({
  createGoogleCalendarEvent: mocks.googleCreate,
  deleteGoogleCalendarEvent: mocks.googleDelete,
  isGoogleCalendarNotConnectedError: () => false,
  listGoogleCalendarEvents: mocks.googleList,
  updateGoogleCalendarEvent: mocks.googleUpdate
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAppointment, maybeAutoSyncAgenda, syncAllAppointmentsToGoogle } from "@/lib/actions/appointments.actions";

const guestCleanupKey = "agenda.googleGuestCleanupDone";
const lastBulkSyncKey = "agenda.lastBulkSyncAt";

function appointment(id: string) {
  return {
    id,
    patientId: `patient-${id}`,
    patient: { id: `patient-${id}`, fullName: `Paciente ${id}`, email: `${id}@example.com`, phone: null },
    title: `Cita ${id}`,
    description: null,
    startTime: new Date("2026-10-12T15:00:00.000Z"),
    endTime: new Date("2026-10-12T15:30:00.000Z"),
    colorId: "1",
    status: "SCHEDULED",
    googleEventId: `google-${id}`
  };
}

beforeEach(() => {
  mocks.settings.clear();
  mocks.remoteEventsWithGuests.clear();
  mocks.removalNotifications.clear();
  mocks.failNextUpdateFor.clear();
  mocks.updateCalls.length = 0;
  mocks.appointments = [appointment("a"), appointment("b")];
  mocks.remoteEventsWithGuests.add("google-a");
  mocks.remoteEventsWithGuests.add("google-b");

  mocks.appointmentFindMany.mockReset().mockImplementation(async () => mocks.appointments);
  mocks.appointmentFindFirst.mockReset().mockResolvedValue(null);
  mocks.appointmentFindUnique.mockReset().mockResolvedValue(null);
  mocks.appointmentCreate.mockReset().mockImplementation(async ({ data }) => ({
    ...data,
    id: "adopted-appointment",
    patient: { id: data.patientId, fullName: "Paciente adopción", email: "patient@example.com", phone: null }
  }));
  mocks.appointmentUpdate.mockReset().mockImplementation(async ({ where, data }) => {
    const current = mocks.appointments.find((item) => item.id === where.id);
    if (current) Object.assign(current, data);
    return current;
  });
  mocks.patientFindUnique.mockReset().mockResolvedValue({
    id: "patient-adoption",
    fullName: "Paciente adopción",
    email: "patient@example.com",
    phone: null
  });
  mocks.patientUpdate.mockReset().mockResolvedValue(undefined);
  mocks.settingFindUnique.mockReset().mockImplementation(async ({ where }) => mocks.settings.get(where.key) ?? null);
  mocks.settingUpsert.mockReset().mockImplementation(async ({ where, create, update }) => {
    const current = mocks.settings.get(where.key);
    const value = current ? update.value : create.value;
    const row = { key: where.key, value, updatedAt: new Date() };
    mocks.settings.set(where.key, row);
    return row;
  });
  mocks.settings.set(lastBulkSyncKey, { key: lastBulkSyncKey, value: new Date().toISOString(), updatedAt: new Date() });

  mocks.googleList.mockReset().mockResolvedValue([]);
  mocks.googleCreate.mockReset().mockResolvedValue({ id: "new-google-event" });
  mocks.googleDelete.mockReset().mockResolvedValue(undefined);
  mocks.googleUpdate.mockReset().mockImplementation(async (eventId, input, sendUpdates = "none") => {
    mocks.updateCalls.push({ eventId, input, sendUpdates });
    if (mocks.failNextUpdateFor.has(eventId)) {
      mocks.failNextUpdateFor.delete(eventId);
      throw new Error("fallo temporal");
    }

    if (sendUpdates === "all" && mocks.remoteEventsWithGuests.has(eventId)) {
      mocks.removalNotifications.set(eventId, (mocks.removalNotifications.get(eventId) ?? 0) + 1);
    }
    mocks.remoteEventsWithGuests.delete(eventId);
  });
  mocks.getConnectionStatus.mockReset().mockResolvedValue({ connected: true, calendarScope: true });
  mocks.recordAudit.mockReset().mockResolvedValue(undefined);
});

describe("one-time Google guest cleanup", () => {
  it("removes guests when an existing Google event is adopted after the cleanup", async () => {
    mocks.settings.set(guestCleanupKey, { key: guestCleanupKey, value: "true" });
    mocks.remoteEventsWithGuests.add("existing-google-event");

    await createAppointment({
      patientId: "patient-adoption",
      title: "Consulta",
      startTime: "2026-10-12T15:00:00.000Z",
      endTime: "2026-10-12T15:30:00.000Z",
      color: "1",
      adoptGoogleEventId: "existing-google-event"
    });

    expect(mocks.updateCalls).toEqual([
      {
        eventId: "existing-google-event",
        input: expect.objectContaining({ colorId: "1" }),
        sendUpdates: "none"
      }
    ]);
    expect("attendees" in (mocks.updateCalls[0].input as Record<string, unknown>)).toBe(false);
  });

  it("notifies once, retries failed events, and then syncs silently", async () => {
    mocks.failNextUpdateFor.add("google-b");

    await maybeAutoSyncAgenda();

    expect(mocks.updateCalls.map((call) => call.sendUpdates)).toEqual(["all", "all"]);
    expect(mocks.removalNotifications.get("google-a")).toBe(1);
    expect(mocks.removalNotifications.has("google-b")).toBe(false);
    expect(mocks.settings.has(guestCleanupKey)).toBe(false);

    await maybeAutoSyncAgenda();

    expect(mocks.removalNotifications.get("google-a")).toBe(1);
    expect(mocks.removalNotifications.get("google-b")).toBe(1);
    expect(mocks.settings.get(guestCleanupKey)?.value).toBe("true");

    await syncAllAppointmentsToGoogle();

    expect(mocks.updateCalls.slice(4).map((call) => call.sendUpdates)).toEqual(["none", "none"]);
    expect(mocks.removalNotifications.get("google-a")).toBe(1);
    expect(mocks.removalNotifications.get("google-b")).toBe(1);
    expect(mocks.updateCalls.every((call) => !("attendees" in (call.input as Record<string, unknown>)))).toBe(true);
  });

  it("clears the migration marker only after every linked event syncs", async () => {
    mocks.failNextUpdateFor.add("google-a");

    await syncAllAppointmentsToGoogle();

    expect(mocks.settings.has(guestCleanupKey)).toBe(false);
  });
});
