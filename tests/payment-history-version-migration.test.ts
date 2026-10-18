import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";

const execFileAsync = promisify(execFile);

it("adds payment-history versions to an existing SQLite database without changing its sheet", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "oe-payment-version-migration-"));
  const priorMigrations = path.join(temporaryRoot, "prior-migrations");
  const sourceMigrations = path.join(process.cwd(), "prisma", "migrations");
  const databaseUrl = `file:${path.join(temporaryRoot, "existing.db").replace(/\\/g, "/")}`;
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await mkdir(priorMigrations);
    for (const entry of await readdir(sourceMigrations, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "20261017130000_payment_history_sheet_versions") {
        await cp(path.join(sourceMigrations, entry.name), path.join(priorMigrations, entry.name), { recursive: true });
      }
    }
    const runMigrations = (migrationsDir: string) => execFileAsync(process.execPath,
      [path.join(process.cwd(), "electron", "init-db.cjs")], {
        cwd: process.cwd(),
        env: { ...process.env, APP_DATA_DIR: temporaryRoot, MIGRATIONS_DIR: migrationsDir, DATABASE_URL: databaseUrl }
      });
    await runMigrations(priorMigrations);
    const patient = await db.patient.create({ data: { fullName: "Paciente de prueba" } });
    const attachment = await db.attachment.create({ data: {
      patientId: patient.id, category: "PAYMENT_HISTORY", originalName: "pagos.xlsx",
      localRelativePath: "pagos.xlsx", sourceRelativePath: "Paciente de prueba/pagos.xlsx", sizeBytes: 10
    } });
    const sheet = await db.paymentHistorySheet.create({ data: {
      patientId: patient.id, attachmentId: attachment.id,
      googleFileId: "existing-google-id", googleUrl: "https://docs.google.com/spreadsheets/d/existing-google-id",
      googleFolderId: "folder-id", uploadStatus: "UPLOADED", isActive: true
    } });

    await runMigrations(sourceMigrations);
    const upgraded = await db.paymentHistorySheet.findUniqueOrThrow({
      where: { id: sheet.id }, include: { versions: true }
    });
    expect(upgraded.googleFileId).toBe("existing-google-id");
    expect(upgraded.isActive).toBe(true);
    expect(upgraded.versions).toHaveLength(1);
    expect(upgraded.versions[0]).toMatchObject({
      googleFileId: "existing-google-id", sourceSha256: null,
      uploadStatus: "UPLOADED"
    });
  } finally {
    await db.$disconnect();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 60_000);
