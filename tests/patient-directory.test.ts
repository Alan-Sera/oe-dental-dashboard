import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assignMissingProfilePhotos, listPatientDirectory } from "@/lib/patient-directory";

const execFileAsync = promisify(execFile);
const asOf = new Date("2026-10-17T12:00:00.000Z");

function createTestClient(databaseUrl: string) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [{ emit: "event", level: "query" }] as const
  });
}

describe("patient directory projection", () => {
  let temporaryRoot: string;
  let db: ReturnType<typeof createTestClient>;
  const queries: string[] = [];

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "oe-patient-directory-test-"));
    const databaseUrl = `file:${path.join(temporaryRoot, "directory.db").replace(/\\/g, "/")}`;
    await execFileAsync(process.execPath, [path.join(process.cwd(), "electron", "init-db.cjs")], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_DATA_DIR: temporaryRoot,
        MIGRATIONS_DIR: path.join(process.cwd(), "prisma", "migrations"),
        DATABASE_URL: databaseUrl
      }
    });
    db = createTestClient(databaseUrl);
    db.$on("query", (event) => queries.push(event.query));

    for (let offset = 0; offset < 1005; offset += 200) {
      const indexes = Array.from({ length: Math.min(200, 1005 - offset) }, (_, index) => offset + index);
      await db.patient.createMany({
        data: indexes.map((index) => ({
          id: `directory-patient-${index}`,
          fullName: `Paciente ficticio ${index}`,
          profilePhotoId: `directory-photo-${index}`
        }))
      });
      await db.attachment.createMany({
        data: indexes.map((index) => ({
          id: `directory-photo-${index}`,
          patientId: `directory-patient-${index}`,
          category: "PHOTO" as const,
          originalName: "foto.jpg",
          localRelativePath: "foto.jpg",
          sourceRelativePath: `Paciente ficticio ${index}/foto.jpg`,
          sizeBytes: 1,
          sourceModifiedAt: new Date("2024-01-01T00:00:00.000Z")
        }))
      });
    }

    await db.patient.create({
      data: {
        id: "directory-main",
        fullName: "Ana de prueba",
        phone: "9831234567",
        email: "ana@example.test",
        gender: "FEMENINO"
      }
    });
    await db.attachment.createMany({
      data: [
        {
          id: "directory-document",
          patientId: "directory-main",
          category: "OTHER",
          originalName: "documento.pdf",
          localRelativePath: "documento.pdf",
          sourceRelativePath: "Ana de prueba/documento.pdf",
          sizeBytes: 100,
          importedAt: new Date("2019-01-01T00:00:00.000Z")
        },
        {
          id: "directory-first-photo",
          patientId: "directory-main",
          category: "PHOTO",
          originalName: "primera.jpg",
          localRelativePath: "primera.jpg",
          sourceRelativePath: "Ana de prueba/primera.jpg",
          sizeBytes: 10,
          importedAt: new Date("2020-01-01T00:00:00.000Z"),
          sourceModifiedAt: new Date("2024-03-01T12:00:00.000Z")
        },
        {
          id: "directory-second-photo",
          patientId: "directory-main",
          category: "PHOTO",
          originalName: "segunda.jpg",
          localRelativePath: "segunda.jpg",
          sourceRelativePath: "Ana de prueba/segunda.jpg",
          sizeBytes: 20,
          importedAt: new Date("2021-01-01T00:00:00.000Z")
        }
      ]
    });
    await db.clinicalEntry.create({
      data: { patientId: "directory-main", entryDate: asOf, notes: "Historial extenso que no debe cargarse en la lista" }
    });
    await db.treatmentCharge.createMany({
      data: [
        { patientId: "directory-main", description: "Cargo abierto", amountCents: 5000, currency: "MXN", serviceDate: asOf, status: "OPEN" },
        { patientId: "directory-main", description: "Cargo atendido", amountCents: 1000, currency: "MXN", serviceDate: asOf, status: "PAID" },
        { patientId: "directory-main", description: "Cargo anulado", amountCents: 9000, currency: "MXN", serviceDate: asOf, status: "VOID" }
      ]
    });
    await db.payment.createMany({
      data: [
        { patientId: "directory-main", amountCents: 2000, currency: "MXN", paidAt: asOf, method: "EFECTIVO", status: "CONFIRMED" },
        { patientId: "directory-main", amountCents: 3000, currency: "MXN", paidAt: asOf, method: "EFECTIVO", status: "PENDING" }
      ]
    });
    await db.appointment.createMany({
      data: [
        { id: "directory-cancelled", patientId: "directory-main", title: "Cancelada", startTime: new Date("2026-10-18T12:00:00.000Z"), endTime: new Date("2026-10-18T13:00:00.000Z"), status: "CANCELLED" },
        { id: "directory-confirmed", patientId: "directory-main", title: "Confirmada", startTime: new Date("2026-10-20T12:00:00.000Z"), endTime: new Date("2026-10-20T13:00:00.000Z"), status: "CONFIRMED" },
        { id: "directory-later", patientId: "directory-main", title: "Posterior", startTime: new Date("2026-10-22T12:00:00.000Z"), endTime: new Date("2026-10-22T13:00:00.000Z"), status: "SCHEDULED" }
      ]
    });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("assigns the earliest photo without loading every attachment", async () => {
    queries.length = 0;
    expect(await assignMissingProfilePhotos(db)).toEqual({ updated: 1 });
    const patient = await db.patient.findUniqueOrThrow({ where: { id: "directory-main" }, select: { profilePhotoId: true } });
    expect(patient.profilePhotoId).toBe("directory-first-photo");
    expect(await assignMissingProfilePhotos(db)).toEqual({ updated: 0 });
    expect(queries.some((query) => query.includes("ClinicalEntry"))).toBe(false);
  });

  it("returns over a thousand compact records with the same balance, appointment and photo", async () => {
    queries.length = 0;
    const directory = await listPatientDirectory(db, asOf);
    expect(directory).toHaveLength(1006);
    const main = directory.find((patient) => patient.id === "directory-main");
    expect(main).toMatchObject({
      fullName: "Ana de prueba",
      phone: "9831234567",
      email: "ana@example.test",
      gender: "FEMENINO",
      balanceCents: 4000,
      nextAppointmentId: "directory-confirmed",
      nextAppointmentDate: "2026-10-20T12:00:00.000Z",
      photoAttachmentId: "directory-first-photo",
      photoVersion: "2024-03-01T12:00:00.000Z"
    });
    expect(Object.keys(main ?? {}).sort()).toEqual([
      "balanceCents", "email", "fullName", "gender", "id", "nextAppointmentDate",
      "nextAppointmentId", "phone", "photoAttachmentId", "photoVersion", "updatedAt"
    ]);
    expect(directory.find((patient) => patient.id === "directory-patient-1004")?.photoVersion)
      .toBe("2024-01-01T00:00:00.000Z");
    expect(queries.some((query) => /ClinicalEntry|PaymentHistorySheet|ImportItem|AuditLog/.test(query))).toBe(false);
  });
});
