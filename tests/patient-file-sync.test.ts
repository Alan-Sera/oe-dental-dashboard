import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { shouldRefreshLinkedFile, syncPatientFolder, type FileSyncFolderResult } from "@/lib/patient-file-sync-core";
import { nextFileRetryDelay, PatientFileSyncRuntime } from "@/lib/patient-file-sync-runtime";
import { createExifJpeg } from "./fixtures/image-metadata";

const execFileAsync = promisify(execFile);
const oldModifiedAt = new Date("2020-01-01T12:00:00.000Z");

describe("patient file synchronization", () => {
  let temporaryRoot: string;
  let patientsRoot: string;
  let db: PrismaClient;

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "oe-patient-sync-test-"));
    patientsRoot = path.join(temporaryRoot, "patients");
    await mkdir(patientsRoot);
    const databaseUrl = `file:${path.join(temporaryRoot, "sync.db").replace(/\\/g, "/")}`;
    await execFileAsync(process.execPath, [
      path.join(process.cwd(), "electron", "init-db.cjs")
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_DATA_DIR: temporaryRoot,
        MIGRATIONS_DIR: path.join(process.cwd(), "prisma", "migrations"),
        DATABASE_URL: databaseUrl
      }
    });
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("links a new folder and nested files without creating clinical or payment records", async () => {
    const folder = path.join(patientsRoot, "001 Paciente Uno");
    await mkdir(path.join(folder, "Fotos"), { recursive: true });
    await writeFile(path.join(folder, "Fotos", "sonrisa.jpg"), "image-one");
    await writeFile(path.join(folder, "historia.txt"), "Historia de prueba");
    await writeFile(path.join(folder, "pagos.xlsx"), "spreadsheet-test");
    await utimes(path.join(folder, "Fotos", "sonrisa.jpg"), oldModifiedAt, oldModifiedAt);
    await utimes(path.join(folder, "historia.txt"), oldModifiedAt, oldModifiedAt);
    await utimes(path.join(folder, "pagos.xlsx"), oldModifiedAt, oldModifiedAt);

    const result = await syncPatientFolder(patientsRoot, "001 Paciente Uno", db);
    expect(result).toMatchObject({ createdPatient: true, scanned: 3, linked: 3, updated: 0, conflict: null });
    const patient = await db.patient.findUniqueOrThrow({
      where: { localFolderRelativePath: "001 Paciente Uno" },
      include: { attachments: true, clinicalEntries: true, paymentHistorySheets: true }
    });
    expect(patient.fullName).toBe("Paciente Uno");
    expect(result.patientId).toBe(patient.id);
    expect(patient.attachments.map((item) => item.localRelativePath).sort()).toEqual([
      "Fotos/sonrisa.jpg", "historia.txt", "pagos.xlsx"
    ]);
    expect(patient.clinicalEntries).toHaveLength(0);
    expect(patient.paymentHistorySheets).toHaveLength(0);
    expect(await db.importBatch.count()).toBe(0);
  });

  it("keeps attachment identities when unchanged and refreshes modified metadata", async () => {
    const folderName = "001 Paciente Uno";
    const before = await db.attachment.findFirstOrThrow({ where: { localRelativePath: "Fotos/sonrisa.jpg" } });
    expect(await syncPatientFolder(patientsRoot, folderName, db)).toMatchObject({ linked: 0, updated: 0 });
    const imagePath = path.join(patientsRoot, folderName, "Fotos", "sonrisa.jpg");
    await writeFile(imagePath, "image-two-different-size");
    const newModifiedAt = new Date("2021-01-01T12:00:00.000Z");
    await utimes(imagePath, newModifiedAt, newModifiedAt);

    expect(await syncPatientFolder(patientsRoot, folderName, db)).toMatchObject({ linked: 0, updated: 1 });
    const after = await db.attachment.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.id).toBe(before.id);
    expect(after.sizeBytes).toBeGreaterThan(before.sizeBytes);
    expect(after.sourceModifiedAt?.getTime()).toBe(newModifiedAt.getTime());
    expect(await db.attachment.count()).toBe(3);
  });

  it("holds a different folder with the same patient name for review", async () => {
    await mkdir(path.join(patientsRoot, "002 Paciente Uno"));
    const result = await syncPatientFolder(patientsRoot, "002 Paciente Uno", db);
    expect(result.conflict).toEqual({ folder: "002 Paciente Uno", patientName: "Paciente Uno" });
    expect(result.createdPatient).toBe(false);
    expect(await db.patient.count()).toBe(1);
  });

  it("ignores absent folders and does not remove linked records", async () => {
    await expect(syncPatientFolder(patientsRoot, "No existe", db)).resolves.toMatchObject({ linked: 0, updated: 0 });
    await rm(path.join(patientsRoot, "001 Paciente Uno", "pagos.xlsx"));
    await expect(syncPatientFolder(patientsRoot, "001 Paciente Uno", db)).resolves.toMatchObject({ linked: 0, updated: 0 });
    expect(await db.attachment.count()).toBe(3);
  });

  it("compares size and modification time", () => {
    expect(shouldRefreshLinkedFile(
      { sizeBytes: 10, sourceModifiedAt: oldModifiedAt },
      { size: 10, mtimeMs: oldModifiedAt.getTime() }
    )).toBe(false);
    expect(shouldRefreshLinkedFile(
      { sizeBytes: 10, sourceModifiedAt: null },
      { size: 10, mtimeMs: oldModifiedAt.getTime() }
    )).toBe(true);
  });

  it("recalculates EXIF capture dates and clears stale dates when a replacement has none", async () => {
    const folderName = "008 Foto Reemplazada";
    const folder = path.join(patientsRoot, folderName);
    const photoPath = path.join(folder, "foto.jpg");
    await mkdir(folder);
    await writeFile(photoPath, createExifJpeg("2020:01:02 03:04:05"));
    await utimes(photoPath, oldModifiedAt, oldModifiedAt);

    const initial = await syncPatientFolder(patientsRoot, folderName, db);
    expect(initial).toMatchObject({ linked: 1, failedPaths: [] });
    const original = await db.attachment.findFirstOrThrow({ where: { patientId: initial.patientId! } });
    expect(original.capturedAt?.toISOString()).toBe("2020-01-02T03:04:05.000Z");

    await writeFile(photoPath, createExifJpeg("2021:06:07 08:09:10"));
    await utimes(photoPath, new Date("2021-01-01T12:00:00.000Z"), new Date("2021-01-01T12:00:00.000Z"));
    expect(await syncPatientFolder(patientsRoot, folderName, db)).toMatchObject({ updated: 1, failedPaths: [] });
    const replaced = await db.attachment.findUniqueOrThrow({ where: { id: original.id } });
    expect(replaced.capturedAt?.toISOString()).toBe("2021-06-07T08:09:10.000Z");

    await writeFile(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await utimes(photoPath, new Date("2022-01-01T12:00:00.000Z"), new Date("2022-01-01T12:00:00.000Z"));
    expect(await syncPatientFolder(patientsRoot, folderName, db)).toMatchObject({ updated: 1, failedPaths: [] });
    const withoutExif = await db.attachment.findUniqueOrThrow({ where: { id: original.id } });
    expect(withoutExif.capturedAt).toBeNull();
    expect(await db.attachment.count({ where: { patientId: initial.patientId! } })).toBe(1);
  });

  it("keeps an inaccessible file pending while linking the other files", async () => {
    const folderName = "004 Archivos Aislados";
    const folder = path.join(patientsRoot, folderName);
    await mkdir(folder);
    await writeFile(path.join(folder, "bloqueado.pdf"), "blocked-content");
    await writeFile(path.join(folder, "disponible.pdf"), "available-content");
    await utimes(path.join(folder, "bloqueado.pdf"), oldModifiedAt, oldModifiedAt);
    await utimes(path.join(folder, "disponible.pdf"), oldModifiedAt, oldModifiedAt);
    const blockedStat = ((filePath: string) => {
      if (filePath.endsWith("bloqueado.pdf")) {
        return Promise.reject(Object.assign(new Error("Access denied"), { code: "EACCES" }));
      }
      return stat(filePath);
    }) as typeof stat;

    const first = await syncPatientFolder(patientsRoot, folderName, db, { readdir, stat: blockedStat });
    expect(first).toMatchObject({ linked: 1, failedPaths: [`${folderName}/bloqueado.pdf`] });
    const linked = await db.attachment.findMany({ where: { patientId: first.patientId! } });
    expect(linked.map((item) => item.originalName)).toEqual(["disponible.pdf"]);

    const recovered = await syncPatientFolder(patientsRoot, folderName, db);
    expect(recovered).toMatchObject({ linked: 1, failedPaths: [] });
    expect(await db.attachment.count({ where: { patientId: first.patientId! } })).toBe(2);
  });

  it("checks a large batch of recent files with at most eight concurrent waits", async () => {
    const folderName = "006 Lote Reciente";
    const folder = path.join(patientsRoot, folderName);
    await mkdir(folder);
    await Promise.all(Array.from({ length: 17 }, (_, index) =>
      writeFile(path.join(folder, `archivo-${index}.pdf`), `contenido-${index}`)
    ));
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const waitForSettling = () => new Promise<void>((resolve) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      releases.push(() => {
        active -= 1;
        resolve();
      });
    });

    const syncing = syncPatientFolder(patientsRoot, folderName, db, { readdir, stat, waitForSettling });
    for (const expected of [8, 8, 1]) {
      await vi.waitFor(() => expect(releases).toHaveLength(expected));
      expect(active).toBe(expected);
      expect(await db.attachment.count({ where: { patient: { localFolderRelativePath: folderName } } })).toBe(0);
      releases.splice(0).forEach((release) => release());
    }
    const result = await syncing;
    expect(result).toMatchObject({ scanned: 17, linked: 17, deferred: 0, failedPaths: [] });
    expect(maxActive).toBe(8);
    expect(await db.attachment.count({ where: { patientId: result.patientId! } })).toBe(17);
  });

  it("defers only a file that changes between the two metadata readings", async () => {
    const folderName = "007 Archivo Cambiante";
    const folder = path.join(patientsRoot, folderName);
    await mkdir(folder);
    await writeFile(path.join(folder, "estable.pdf"), "stable");
    await writeFile(path.join(folder, "cambiando.pdf"), "initial");

    const first = await syncPatientFolder(patientsRoot, folderName, db, {
      readdir,
      stat,
      waitForSettling: async (absolutePath) => {
        if (absolutePath.endsWith("cambiando.pdf")) await writeFile(absolutePath, "updated-and-larger");
      }
    });
    expect(first).toMatchObject({ scanned: 2, linked: 1, deferred: 1, failedPaths: [] });
    const firstAttachments = await db.attachment.findMany({ where: { patientId: first.patientId! } });
    expect(firstAttachments.map((item) => item.originalName)).toEqual(["estable.pdf"]);

    const second = await syncPatientFolder(patientsRoot, folderName, db, {
      readdir, stat, waitForSettling: async () => undefined
    });
    expect(second).toMatchObject({ linked: 1, deferred: 0, failedPaths: [] });
    expect(await db.attachment.count({ where: { patientId: first.patientId! } })).toBe(2);
  });

  it("retries failed routes progressively and clears them after recovery", async () => {
    expect([undefined, 5_000, 10_000, 20_000, 30_000].map(nextFileRetryDelay))
      .toEqual([5_000, 10_000, 20_000, 30_000, 30_000]);

    const folderName = "005 Reintento";
    await mkdir(path.join(patientsRoot, folderName));
    await db.setting.upsert({
      where: { key: "files.patientsRootPath" },
      create: { key: "files.patientsRootPath", value: patientsRoot },
      update: { value: patientsRoot }
    });
    let folderAttempts = 0;
    const synchronizeFolder = vi.fn(async (_root: string, folder: string): Promise<FileSyncFolderResult> => {
      const failedPaths = folder === folderName && ++folderAttempts === 1
        ? [`${folderName}/pendiente.pdf`]
        : [];
      return {
        patientId: null, scanned: 1, linked: 0, updated: 0, deferred: 0,
        createdPatient: false, conflict: null, failedPaths
      };
    });
    const runtime = new PatientFileSyncRuntime(db, synchronizeFolder);
    runtime.start();
    try {
      await vi.waitFor(() => {
        expect(runtime.snapshot().failedFileCount).toBe(1);
        expect(runtime.snapshot().failedFilePaths).toEqual([`${folderName}/pendiente.pdf`]);
        expect(runtime.snapshot().mode).toBe("error");
        expect(runtime.snapshot().lastCompletedAt).toBeNull();
      });
      await vi.waitFor(() => expect(runtime.snapshot().failedFileCount).toBe(0), { timeout: 8_000 });
      expect(folderAttempts).toBe(2);
      expect(runtime.snapshot().mode).toBe("watching");
    } finally {
      runtime.stop();
    }
  }, 12_000);

  it.skipIf(process.platform !== "win32")("detects a new folder while the desktop watcher is active", async () => {
    await db.setting.upsert({
      where: { key: "files.patientsRootPath" },
      create: { key: "files.patientsRootPath", value: patientsRoot },
      update: { value: patientsRoot }
    });
    const runtime = new PatientFileSyncRuntime(db);
    runtime.start();
    try {
      await vi.waitFor(() => expect(runtime.snapshot().mode).toBe("watching"), { timeout: 10_000 });
      await vi.waitFor(() => expect(runtime.snapshot().conflictCount).toBe(1), { timeout: 10_000 });
      const scannedBeforeReview = runtime.snapshot().scanned;
      runtime.requestFullScan();
      await vi.waitFor(() => expect(runtime.snapshot().scanned).toBeGreaterThan(scannedBeforeReview), { timeout: 10_000 });
      expect(runtime.snapshot().conflictCount).toBe(1);
      const newFolder = path.join(patientsRoot, "003 Paciente Dos");
      await mkdir(newFolder);
      const filePath = path.join(newFolder, "radiografia.pdf");
      await writeFile(filePath, "pdf-content");
      await utimes(filePath, oldModifiedAt, oldModifiedAt);
      await vi.waitFor(async () => {
        const patient = await db.patient.findUnique({
          where: { localFolderRelativePath: "003 Paciente Dos" },
          include: { attachments: true }
        });
        expect(patient?.attachments).toHaveLength(1);
        expect(runtime.revisionForPatient(patient!.id)).toBeGreaterThan(0);
      }, { timeout: 15_000, interval: 250 });
      expect(runtime.snapshot().linked).toBeGreaterThan(0);
    } finally {
      runtime.stop();
    }
  }, 20_000);
});
