"use server";

import { revalidatePath } from "next/cache";

import { Prisma, type AppointmentStatus } from "@prisma/client";

import { recordAudit } from "@/lib/actions/audit.actions";
import { isGoogleReconnectRequiredError } from "@/lib/google-drive";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  isGoogleCalendarNotConnectedError,
  listGoogleCalendarEvents,
  updateGoogleCalendarEvent,
  type GoogleCalendarEventInput
} from "@/lib/google-calendar";
import { getGoogleConnectionStatus } from "@/lib/google-settings";
import { prisma } from "@/lib/prisma";
import {
  appointmentDeleteSchema,
  appointmentInputSchema,
  appointmentStatusSchema,
  normalizeAppointmentTitle,
  type AppointmentInput
} from "@/lib/validation";
import type { GoogleSyncSummary, OrphanGoogleEvent } from "@/components/schedule/types";

const ORPHAN_SYNC_PAST_DAYS = 30;
const ORPHAN_SYNC_FUTURE_DAYS = 365;
const AUTO_SYNC_IDLE_MS = 5 * 60 * 1000;
const AUTO_SYNC_RETRY_MIN_MS = 60 * 1000;
const LAST_BULK_SYNC_KEY = "agenda.lastBulkSyncAt";
const LAST_ORPHANS_KEY = "agenda.lastOrphanEvents";
const NEXT_APPOINTMENT_EXCLUDED_STATUSES: AppointmentStatus[] = ["CANCELLED", "NO_SHOW"];

const patientInclude = {
  patient: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true
    }
  }
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithPatient = {
  id: string;
  patientId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  colorId: string | null;
  googleEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
  patient: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  };
};

export type AppointmentResult = {
  appointment: AppointmentWithPatient | null;
  synced: boolean;
  syncError?: string;
};

export async function createAppointment(input: AppointmentInput): Promise<AppointmentResult> {
  const parsed = appointmentInputSchema.parse(input);

  const patient = await getPatientForAppointment(parsed.patientId);
  if (!patient) throw new Error("Paciente no encontrado");

  const title = normalizeAppointmentTitle(parsed.title, patient.fullName);
  const description = clearOrNull(parsed.description);
  const startTime = new Date(parsed.startTime);
  const endTime = new Date(parsed.endTime);
  const adoptGoogleEventId = parsed.adoptGoogleEventId || null;
  const color = clearOrNull(parsed.color);

  let appointment: AppointmentWithPatient;
  let synced = true;
  let syncError: string | undefined;
  let previousPatientId: string | null = null;

  if (adoptGoogleEventId) {
    const existingByGoogleId = await prisma.appointment.findUnique({
      where: { googleEventId: adoptGoogleEventId },
      include: patientInclude
    });

    if (existingByGoogleId) {
      previousPatientId = existingByGoogleId.patientId;
      appointment = await prisma.appointment.update({
        where: { id: existingByGoogleId.id },
        data: {
          patientId: patient.id,
          title,
          description,
          startTime,
          endTime,
          status: parsed.status ?? existingByGoogleId.status,
          colorId: color
        },
        include: patientInclude
      });
    } else {
      appointment = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          title,
          description,
          startTime,
          endTime,
          status: parsed.status ?? "SCHEDULED",
          colorId: color,
          googleEventId: adoptGoogleEventId
        },
        include: patientInclude
      });
    }
  } else {
    appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        title,
        description,
        startTime,
        endTime,
        status: parsed.status ?? "SCHEDULED",
        colorId: color
      },
      include: patientInclude
    });

    const sync = await syncCreateToGoogle({
      summary: title,
      description,
      startTime,
      endTime,
      colorId: color,
      patientEmail: patient.email
    });

    synced = sync.synced;
    syncError = sync.syncError;

    if (sync.synced && sync.googleEventId) {
      appointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { googleEventId: sync.googleEventId },
        include: patientInclude
      });
    }
  }

  await recordAudit("appointment.created", "Appointment", appointment.id, {
    patientId: patient.id,
    synced,
    syncError,
    adoptGoogleEventId
  });
  const affectedPatientIds = uniquePatientIds([previousPatientId, patient.id]);
  await syncPatientNextAppointmentDates(affectedPatientIds);
  revalidateAppointmentViews(affectedPatientIds);

  return { appointment, synced, syncError };
}

export async function updateAppointment(id: string, input: AppointmentInput): Promise<AppointmentResult> {
  const parsed = appointmentInputSchema.parse(input);

  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new Error("Cita no encontrada");

  const patient = await getPatientForAppointment(parsed.patientId);
  if (!patient) throw new Error("Paciente no encontrado");

  const title = normalizeAppointmentTitle(parsed.title, patient.fullName);
  const description = clearOrNull(parsed.description);
  const startTime = new Date(parsed.startTime);
  const endTime = new Date(parsed.endTime);
  const color = clearOrNull(parsed.color);

  let appointment = await prisma.appointment.update({
    where: { id },
    data: {
      patientId: patient.id,
      title,
      description,
      startTime,
      endTime,
      status: parsed.status ?? existing.status,
      colorId: color
    },
    include: patientInclude
  });

  let synced = true;
  let syncError: string | undefined;

  const eventInput: GoogleCalendarEventInput = {
    summary: title,
    description,
    startTime,
    endTime,
    colorId: color,
    attendees: patient.email ? [{ email: patient.email, name: patient.fullName }] : undefined
  };

  const nextStatus = parsed.status ?? existing.status;
  const becomingClosed = nextStatus === "CANCELLED" || nextStatus === "NO_SHOW";

  if (becomingClosed && appointment.googleEventId) {
    const sync = await syncDeleteToGoogle(appointment.googleEventId);
    synced = sync.synced;
    syncError = sync.syncError;
    if (sync.synced) {
      appointment = await prisma.appointment.update({
        where: { id },
        data: { googleEventId: null },
        include: patientInclude
      });
    }
  } else if (appointment.googleEventId) {
    const sync = await syncUpdateToGoogle(appointment.googleEventId, eventInput);
    synced = sync.synced;
    syncError = sync.syncError;
  } else {
    const sync = await syncCreateToGoogle({
      summary: title,
      description,
      startTime,
      endTime,
      colorId: color,
      patientEmail: patient.email
    });
    synced = sync.synced;
    syncError = sync.syncError;
    if (sync.synced && sync.googleEventId) {
      appointment = await prisma.appointment.update({
        where: { id },
        data: { googleEventId: sync.googleEventId },
        include: patientInclude
      });
    }
  }

  await recordAudit("appointment.updated", "Appointment", id, {
    patientId: patient.id,
    synced,
    syncError
  });
  const affectedPatientIds = uniquePatientIds([existing.patientId, patient.id]);
  await syncPatientNextAppointmentDates(affectedPatientIds);
  revalidateAppointmentViews(affectedPatientIds);

  return { appointment, synced, syncError };
}

export async function deleteAppointment(id: string): Promise<{ synced: boolean; syncError?: string }> {
  const parsed = appointmentDeleteSchema.parse({ id });

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.id },
    select: { id: true, patientId: true, googleEventId: true, title: true }
  });
  if (!appointment) throw new Error("Cita no encontrada");

  let synced = true;
  let syncError: string | undefined;

  if (appointment.googleEventId) {
    const sync = await syncDeleteToGoogle(appointment.googleEventId);
    synced = sync.synced;
    syncError = sync.syncError;
  }

  await prisma.appointment.delete({ where: { id: parsed.id } });

  await recordAudit("appointment.deleted", "Appointment", parsed.id, {
    patientId: appointment.patientId,
    title: appointment.title,
    synced,
    syncError
  });
  const affectedPatientIds = [appointment.patientId];
  await syncPatientNextAppointmentDates(affectedPatientIds);
  revalidateAppointmentViews(affectedPatientIds);

  return { synced, syncError };
}

export async function updateAppointmentStatus(
  id: string,
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
): Promise<AppointmentWithPatient> {
  const parsed = appointmentStatusSchema.parse({ id, status });

  const existing = await prisma.appointment.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Cita no encontrada");

  const appointment = await prisma.appointment.update({
    where: { id: parsed.id },
    data: { status: parsed.status },
    include: patientInclude
  });

  await recordAudit("appointment.status_changed", "Appointment", parsed.id, {
    patientId: appointment.patientId,
    status: parsed.status
  });
  const affectedPatientIds = [appointment.patientId];
  await syncPatientNextAppointmentDates(affectedPatientIds);
  revalidateAppointmentViews(affectedPatientIds);

  return appointment;
}

export async function getAppointmentsInRange(start: Date, end: Date) {
  return prisma.appointment.findMany({
    where: {
      startTime: { lt: end },
      endTime: { gt: start }
    },
    include: patientInclude,
    orderBy: { startTime: "asc" }
  });
}

export async function listAppointmentPatients() {
  return prisma.patient.findMany({
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" }
  });
}

export async function getUpcomingPatientAppointments(
  patientId: string,
  limit = 3
): Promise<AppointmentWithPatient[]> {
  return prisma.appointment.findMany({
    where: {
      patientId,
      startTime: { gte: new Date() },
      status: { notIn: NEXT_APPOINTMENT_EXCLUDED_STATUSES }
    },
    include: patientInclude,
    orderBy: { startTime: "asc" },
    take: limit
  });
}

export async function getAppointmentById(id: string): Promise<AppointmentWithPatient | null> {
  const parsed = appointmentDeleteSchema.parse({ id });

  return prisma.appointment.findUnique({
    where: { id: parsed.id },
    include: patientInclude
  });
}

export async function syncAllAppointmentsToGoogle(): Promise<GoogleSyncSummary> {
  const summary = await runGoogleSync();
  revalidatePath("/agenda");
  return summary;
}

export async function maybeAutoSyncAgenda(): Promise<OrphanGoogleEvent[]> {
  const lastSync = await getSettingModifiedAt(LAST_BULK_SYNC_KEY);
  const elapsed = lastSync ? Date.now() - lastSync.getTime() : Number.POSITIVE_INFINITY;

  const stored = await prisma.setting.findUnique({ where: { key: LAST_ORPHANS_KEY } });
  const fallbackOrphans = parseStoredOrphans(stored?.value);

  const pendingWork = elapsed >= AUTO_SYNC_RETRY_MIN_MS ? await hasPendingGoogleSync() : false;
  const shouldRun = elapsed >= AUTO_SYNC_IDLE_MS || pendingWork;
  if (!shouldRun) return fallbackOrphans;

  const summary = await runGoogleSync();

  await prisma.setting.upsert({
    where: { key: LAST_BULK_SYNC_KEY },
    create: { key: LAST_BULK_SYNC_KEY, value: new Date().toISOString() },
    update: { value: new Date().toISOString() }
  });

  return summary.connected ? summary.orphanEvents : fallbackOrphans;
}

async function runGoogleSync(): Promise<GoogleSyncSummary> {
  const connection = await getGoogleConnectionStatus();

  if (!connection.connected || !connection.calendarScope) {
    return {
      connected: false,
      message: connection.connected
        ? "Google está conectado pero falta el permiso de calendario. Reconecta desde Ajustes."
        : "Google no está conectado. Reconecta desde Ajustes para sincronizar las citas.",
      total: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      orphanEvents: []
    };
  }

  try {
    await listGoogleCalendarEvents(new Date(Date.now() - 1000), new Date());
  } catch (error) {
    return {
      connected: false,
      message: toSyncErrorMessage(error),
      total: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      orphanEvents: []
    };
  }

  const appointments = await prisma.appointment.findMany({
    include: patientInclude,
    orderBy: { startTime: "asc" }
  });

  const summary: GoogleSyncSummary = {
    connected: true,
    total: appointments.length,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    orphanEvents: []
  };

  for (const appointment of appointments) {
    const eventInput: GoogleCalendarEventInput = {
      summary: appointment.title,
      description: appointment.description,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      colorId: appointment.colorId,
      attendees: appointment.patient.email
        ? [{ email: appointment.patient.email, name: appointment.patient.fullName }]
        : undefined
    };

    const isClosed = appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";

    if (isClosed) {
      if (appointment.googleEventId) {
        const sync = await syncDeleteToGoogle(appointment.googleEventId);
        if (sync.synced) {
          summary.deleted += 1;
          await prisma.appointment.update({
            where: { id: appointment.id },
            data: { googleEventId: null }
          });
        } else {
          summary.failed += 1;
          summary.errors.push({
            id: appointment.id,
            title: appointment.title,
            message: sync.syncError ?? "No se pudo eliminar el evento de Google"
          });
        }
      } else {
        summary.skipped += 1;
      }
      continue;
    }

    if (!appointment.googleEventId) {
      const sync = await syncCreateToGoogle({
        summary: eventInput.summary,
        description: eventInput.description,
        startTime: eventInput.startTime,
        endTime: eventInput.endTime,
        colorId: eventInput.colorId,
        patientEmail: appointment.patient.email
      });

      if (sync.synced && sync.googleEventId) {
        summary.created += 1;
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { googleEventId: sync.googleEventId }
        });
      } else {
        summary.failed += 1;
        summary.errors.push({
          id: appointment.id,
          title: appointment.title,
          message: sync.syncError ?? "No se pudo crear el evento en Google"
        });
      }
    } else {
      const sync = await syncUpdateToGoogle(appointment.googleEventId, eventInput);

      if (sync.synced) {
        summary.updated += 1;
      } else {
        summary.failed += 1;
        summary.errors.push({
          id: appointment.id,
          title: appointment.title,
          message: sync.syncError ?? "No se pudo actualizar el evento en Google"
        });
      }
    }
  }

  try {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - ORPHAN_SYNC_PAST_DAYS);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + ORPHAN_SYNC_FUTURE_DAYS);

    const localEventIds = new Set(
      appointments.map((item) => item.googleEventId).filter((value): value is string => Boolean(value))
    );

    const events = await listGoogleCalendarEvents(windowStart, windowEnd);
    summary.orphanEvents = events
      .filter((event) => !localEventIds.has(event.id))
      .map((event) => ({
        eventId: event.id,
        title: event.summary || "Evento sin título",
        description: event.description,
        startTime: event.start.toISOString(),
        endTime: event.end.toISOString()
      }));
  } catch (error) {
    summary.message = `No se pudieron leer los eventos de Google para vincular. ${toSyncErrorMessage(error)}`;
  }

  if (summary.connected) {
    await persistOrphanEvents(summary.orphanEvents);
  }

  await recordAudit("appointment.bulk_sync", "Appointment", undefined, {
    total: summary.total,
    created: summary.created,
    updated: summary.updated,
    deleted: summary.deleted,
    skipped: summary.skipped,
    failed: summary.failed,
    orphans: summary.orphanEvents.length
  });

  return summary;
}

async function getSettingModifiedAt(key: string): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.updatedAt ?? null;
}

async function hasPendingGoogleSync(): Promise<boolean> {
  const pending = await prisma.appointment.findFirst({
    where: {
      OR: [
        { googleEventId: null, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
        { googleEventId: { not: null }, status: { in: ["CANCELLED", "NO_SHOW"] } }
      ]
    },
    select: { id: true }
  });
  return pending !== null;
}

async function persistOrphanEvents(orphans: OrphanGoogleEvent[]) {
  await prisma.setting.upsert({
    where: { key: LAST_ORPHANS_KEY },
    create: { key: LAST_ORPHANS_KEY, value: JSON.stringify(orphans) },
    update: { value: JSON.stringify(orphans) }
  });
}

function parseStoredOrphans(value: string | null | undefined): OrphanGoogleEvent[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is OrphanGoogleEvent =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as OrphanGoogleEvent).eventId === "string" &&
        typeof (item as OrphanGoogleEvent).title === "string" &&
        typeof (item as OrphanGoogleEvent).startTime === "string" &&
        typeof (item as OrphanGoogleEvent).endTime === "string" &&
        ((item as OrphanGoogleEvent).description == null ||
          typeof (item as OrphanGoogleEvent).description === "string")
    );
  } catch {
    return [];
  }
}

async function getPatientForAppointment(patientId: string) {
  return prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, fullName: true, email: true, phone: true }
  });
}

function uniquePatientIds(patientIds: Array<string | null | undefined>) {
  return Array.from(
    new Set(patientIds.filter((patientId): patientId is string => Boolean(patientId)))
  );
}

async function syncPatientNextAppointmentDates(patientIds: string[]) {
  await Promise.all(patientIds.map((patientId) => syncPatientNextAppointmentDate(patientId)));
}

async function syncPatientNextAppointmentDate(patientId: string) {
  const nextAppointment = await prisma.appointment.findFirst({
    where: {
      patientId,
      startTime: { gte: new Date() },
      status: { notIn: NEXT_APPOINTMENT_EXCLUDED_STATUSES }
    },
    orderBy: { startTime: "asc" },
    select: { startTime: true }
  });

  await prisma.patient.update({
    where: { id: patientId },
    data: { nextAppointmentDate: nextAppointment?.startTime ?? null }
  });
}

function revalidateAppointmentViews(patientIds: string[]) {
  revalidatePath("/agenda");
  revalidatePath("/patients");

  for (const patientId of patientIds) {
    revalidatePath(`/patients/${patientId}`);
  }
}

function clearOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function syncCreateToGoogle({
  summary,
  description,
  startTime,
  endTime,
  colorId,
  patientEmail
}: GoogleCalendarEventInput & { patientEmail?: string | null }): Promise<{ synced: boolean; syncError?: string; googleEventId?: string }> {
  try {
    const result = await createGoogleCalendarEvent({
      summary,
      description,
      startTime,
      endTime,
      colorId,
      attendees: patientEmail ? [{ email: patientEmail }] : undefined
    });

    return { synced: true, googleEventId: result.id };
  } catch (error) {
    return { synced: false, syncError: toSyncErrorMessage(error) };
  }
}

async function syncUpdateToGoogle(
  eventId: string,
  input: GoogleCalendarEventInput
): Promise<{ synced: boolean; syncError?: string }> {
  try {
    await updateGoogleCalendarEvent(eventId, input);
    return { synced: true };
  } catch (error) {
    return { synced: false, syncError: toSyncErrorMessage(error) };
  }
}

async function syncDeleteToGoogle(eventId: string): Promise<{ synced: boolean; syncError?: string }> {
  try {
    await deleteGoogleCalendarEvent(eventId);
    return { synced: true };
  } catch (error) {
    return { synced: false, syncError: toSyncErrorMessage(error) };
  }
}

function toSyncErrorMessage(error: unknown) {
  if (isGoogleCalendarNotConnectedError(error)) return error.message;
  if (isGoogleReconnectRequiredError(error)) {
    return "El acceso a Google expiró o fue revocado. Reconecta Google para continuar.";
  }
  return error instanceof Error ? error.message : "No se pudo sincronizar con Google Calendar";
}
