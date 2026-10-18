import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ db: null as PrismaClient | null, root: "", failTransactionOnce: false }));
const drive = vi.hoisted(() => ({
  find: vi.fn(),
  upload: vi.fn(),
  refresh: vi.fn(async () => "test-access-token")
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession: vi.fn(async () => ({})) }));
vi.mock("@/lib/actions/settings.actions", () => ({
  getClinicSettings: vi.fn(async () => ({ patientsRootPath: context.root }))
}));
vi.mock("@/lib/google-settings", () => ({ getGoogleDriveRefreshToken: vi.fn(async () => "test-refresh-token") }));
vi.mock("@/lib/google-drive", () => ({
  extractGoogleDriveFolderId: (value: string) => value,
  findGoogleDriveResource: drive.find,
  getGoogleOAuthConfig: () => ({ clientId: "test", clientSecret: "test" }),
  isGoogleReconnectRequiredError: () => false,
  refreshGoogleAccessToken: drive.refresh,
  uploadXlsxAsGoogleSheet: drive.upload
}));
vi.mock("@/lib/services/payment-history-upload", () => ({
  ensurePaymentHistorySheetUploaded: vi.fn(),
  PaymentHistoryUploadAlreadyRunningError: class extends Error {}
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, {
    get: (_, key) => {
      const db = context.db;
      if (!db) throw new Error("La base temporal no está inicializada.");
      if (key === "$transaction") return (...args: Parameters<PrismaClient["$transaction"]>) => {
        if (context.failTransactionOnce) {
          context.failTransactionOnce = false;
          throw new Error("Error de base de datos");
        }
        return db.$transaction(...args);
      };
      const value = db[key as keyof PrismaClient];
      return typeof value === "function" ? value.bind(db) : value;
    }
  })
}));

import { getPatientClinicalFileConflicts } from "@/lib/clinical-file-conflicts";
import { resolveLinkedTextClinicalConflict, updateLinkedTextClinicalHistory } from "@/lib/actions/clinical.actions";
import { createNewPaymentHistoryVersion } from "@/lib/actions/payment-history.actions";
import { getPatientPaymentFileStates } from "@/lib/payment-file-versions";

const execFileAsync = promisify(execFile);
let temporaryRoot: string;
let db: PrismaClient;
let sequence = 0;
const previousAppDataDir = process.env.APP_DATA_DIR;

function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "oe-conflict-test-"));
  process.env.APP_DATA_DIR = temporaryRoot;
  context.root = path.join(temporaryRoot, "patients");
  await mkdir(context.root);
  const databaseUrl = `file:${path.join(temporaryRoot, "test.db").replace(/\\/g, "/")}`;
  await execFileAsync(process.execPath, [path.join(process.cwd(), "electron", "init-db.cjs")], {
    cwd: process.cwd(),
    env: { ...process.env, APP_DATA_DIR: temporaryRoot,
      MIGRATIONS_DIR: path.join(process.cwd(), "prisma", "migrations"), DATABASE_URL: databaseUrl }
  });
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  context.db = db;
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  context.db = null;
  if (previousAppDataDir === undefined) delete process.env.APP_DATA_DIR;
  else process.env.APP_DATA_DIR = previousAppDataDir;
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

async function createClinicalFixture(initialNotes = "Historia original") {
  const folderName = `00${++sequence} Paciente Clínico`;
  const folder = path.join(context.root, folderName);
  await mkdir(folder);
  const filePath = path.join(folder, "historia.txt");
  await writeFile(filePath, initialNotes);
  const patient = await db.patient.create({
    data: { fullName: `Paciente Clínico ${sequence}`, localFolderRelativePath: folderName }
  });
  const entry = await db.clinicalEntry.create({
    data: { patientId: patient.id, entryDate: new Date(), notes: initialNotes }
  });
  const attachment = await db.attachment.create({
    data: { patientId: patient.id, category: "CLINICAL_HISTORY", originalName: "historia.txt",
      localRelativePath: "historia.txt", sourceRelativePath: `${folderName}/historia.txt`,
      sizeBytes: Buffer.byteLength(initialNotes), clinicalEntryId: entry.id, mimeType: "text/plain" }
  });
  return { patient, entry, attachment, filePath };
}

async function createPaymentFixture() {
  const folderName = `00${++sequence} Paciente Pagos`;
  const folder = path.join(context.root, folderName);
  await mkdir(folder);
  const filePath = path.join(folder, "pagos.xlsx");
  await writeFile(filePath, "new-xlsx-content");
  const patient = await db.patient.create({
    data: { fullName: `Paciente Pagos ${sequence}`, localFolderRelativePath: folderName }
  });
  const attachment = await db.attachment.create({ data: {
    patientId: patient.id, category: "PAYMENT_HISTORY", originalName: "pagos.xlsx",
    localRelativePath: "pagos.xlsx", sourceRelativePath: `${folderName}/pagos.xlsx`, sizeBytes: 16
  } });
  const sheet = await db.paymentHistorySheet.create({ data: {
    patientId: patient.id, attachmentId: attachment.id, googleFileId: "old-google-id",
    googleUrl: "https://docs.google.com/spreadsheets/d/old-google-id", googleFolderId: "folder-id",
    uploadStatus: "UPLOADED", isActive: true
  } });
  await db.paymentHistorySheetVersion.create({ data: {
    sheetId: sheet.id, googleFileId: "old-google-id", googleFolderId: "folder-id",
    googleUrl: sheet.googleUrl, sourceSha256: hash("old-xlsx-content"), uploadStatus: "UPLOADED"
  } });
  return { patient, attachment, sheet, filePath };
}

describe("linked clinical text conflicts", () => {
  it("blocks a stale editor and imports an external change as a separate entry", async () => {
    const fixture = await createClinicalFixture();
    await writeFile(fixture.filePath, "Historia externa");
    const patient = await db.patient.findUniqueOrThrow({
      where: { id: fixture.patient.id }, include: { clinicalEntries: { include: { attachments: true } } }
    });
    const conflicts = await getPatientClinicalFileConflicts(patient);
    expect(conflicts).toMatchObject([{ attachmentId: fixture.attachment.id, sourceHash: hash("Historia externa") }]);
    await expect(updateLinkedTextClinicalHistory({ patientId: patient.id,
      clinicalEntryId: fixture.entry.id, expectedEntryUpdatedAt: fixture.entry.updatedAt.toISOString(),
      notes: "Edición desde la app" })).rejects.toThrow("cambió fuera de la app");
    expect(await readFile(fixture.filePath, "utf8")).toBe("Historia externa");

    const resolved = await resolveLinkedTextClinicalConflict({
      patientId: patient.id, attachmentId: fixture.attachment.id,
      expectedSourceHash: conflicts[0].sourceHash,
      expectedEntryUpdatedAt: conflicts[0].entryUpdatedAt, resolution: "use-file"
    });
    const oldEntry = await db.clinicalEntry.findUniqueOrThrow({ where: { id: fixture.entry.id } });
    const newEntry = await db.clinicalEntry.findUniqueOrThrow({ where: { id: resolved.entryId } });
    const attachment = await db.attachment.findUniqueOrThrow({ where: { id: fixture.attachment.id } });
    expect(oldEntry.notes).toBe("Historia original");
    expect(newEntry.notes).toBe("Historia externa");
    expect(attachment.clinicalEntryId).toBe(newEntry.id);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { event: "clinical_entry.external_file_imported", entityId: newEntry.id }
    });
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({
      previousEntryId: oldEntry.id, attachmentId: attachment.id
    });
    expect(await readFile(path.join(temporaryRoot, "backups", "text-history", resolved.backupFileName), "utf8"))
      .toBe("Historia externa");
  });

  it("backs up the external version before restoring the app version", async () => {
    const fixture = await createClinicalFixture();
    await writeFile(fixture.filePath, "Cambio ajeno");
    const resolved = await resolveLinkedTextClinicalConflict({
      patientId: fixture.patient.id, attachmentId: fixture.attachment.id,
      expectedSourceHash: hash("Cambio ajeno"),
      expectedEntryUpdatedAt: fixture.entry.updatedAt.toISOString(), resolution: "use-app"
    });
    expect(await readFile(fixture.filePath, "utf8")).toBe("Historia original");
    expect(await readFile(path.join(temporaryRoot, "backups", "text-history", resolved.backupFileName), "utf8"))
      .toBe("Cambio ajeno");
    expect(await db.clinicalEntry.count({ where: { patientId: fixture.patient.id } })).toBe(1);
  });

  it("restores the external file if recording the chosen app version fails", async () => {
    const fixture = await createClinicalFixture();
    await writeFile(fixture.filePath, "Cambio externo protegido");
    context.failTransactionOnce = true;
    try {
      await expect(resolveLinkedTextClinicalConflict({
        patientId: fixture.patient.id, attachmentId: fixture.attachment.id,
        expectedSourceHash: hash("Cambio externo protegido"),
        expectedEntryUpdatedAt: fixture.entry.updatedAt.toISOString(), resolution: "use-app"
      })).rejects.toThrow("Error de base de datos");
    } finally {
      context.failTransactionOnce = false;
    }
    expect(await readFile(fixture.filePath, "utf8")).toBe("Cambio externo protegido");
  });

  it("rejects a stale conflict decision without changing either version", async () => {
    const fixture = await createClinicalFixture();
    await writeFile(fixture.filePath, "Versión reciente");
    await expect(resolveLinkedTextClinicalConflict({
      patientId: fixture.patient.id, attachmentId: fixture.attachment.id,
      expectedSourceHash: hash("Versión anterior"),
      expectedEntryUpdatedAt: fixture.entry.updatedAt.toISOString(), resolution: "use-app"
    })).rejects.toThrow("volvió a cambiar");
    expect(await readFile(fixture.filePath, "utf8")).toBe("Versión reciente");
  });

  it("rejects an edit from an old app session even if the file matches the newer entry", async () => {
    const fixture = await createClinicalFixture();
    await db.clinicalEntry.update({ where: { id: fixture.entry.id }, data: { notes: "Historia de otra sesión" } });
    await writeFile(fixture.filePath, "Historia de otra sesión");
    await expect(updateLinkedTextClinicalHistory({
      patientId: fixture.patient.id, clinicalEntryId: fixture.entry.id,
      expectedEntryUpdatedAt: fixture.entry.updatedAt.toISOString(), notes: "Edición antigua"
    })).rejects.toThrow("cambió en otra sesión");
    expect(await readFile(fixture.filePath, "utf8")).toBe("Historia de otra sesión");
  });

  it("updates a matching clinical file and keeps a recoverable backup", async () => {
    const fixture = await createClinicalFixture();
    await updateLinkedTextClinicalHistory({
      patientId: fixture.patient.id, clinicalEntryId: fixture.entry.id,
      expectedEntryUpdatedAt: fixture.entry.updatedAt.toISOString(), notes: "Historia editada"
    });
    expect(await readFile(fixture.filePath, "utf8")).toBe("Historia editada");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { event: "clinical_entry.text_file_updated", entityId: fixture.entry.id },
      orderBy: { createdAt: "desc" }
    });
    const backupFileName = (JSON.parse(audit.metadata ?? "{}") as { backupFileName: string }).backupFileName;
    expect(await readFile(path.join(temporaryRoot, "backups", "text-history", backupFileName), "utf8"))
      .toBe("Historia original");
  });
});

describe("payment history versions", () => {
  beforeEach(() => {
    drive.find.mockReset();
    drive.upload.mockReset();
  });
  it("uploads a new Drive sheet while retaining the previous version", async () => {
    const { patient, sheet } = await createPaymentFixture();
    const patientWithSheets = await db.patient.findUniqueOrThrow({
      where: { id: patient.id }, include: { paymentHistorySheets: {
        include: { attachment: true, versions: { orderBy: { createdAt: "desc" } } }
      } }
    });
    expect(await getPatientPaymentFileStates(patientWithSheets)).toMatchObject([
      { sheetId: sheet.id, state: "changed", sourceHash: hash("new-xlsx-content") }
    ]);
    drive.find.mockResolvedValue(null);
    drive.upload.mockResolvedValue({ id: "new-google-id",
      webViewLink: "https://docs.google.com/spreadsheets/d/new-google-id" });

    const result = await createNewPaymentHistoryVersion({
      patientId: patient.id, sheetId: sheet.id,
      expectedSourceHash: hash("new-xlsx-content"), googleFolderInput: "folder-id"
    });
    const updated = await db.paymentHistorySheet.findUniqueOrThrow({
      where: { id: sheet.id }, include: { versions: true }
    });
    expect(updated.googleFileId).toBe("new-google-id");
    expect(updated.versions.map((version) => version.googleFileId)).toContain("old-google-id");
    expect(updated.versions.map((version) => version.googleFileId)).toContain("new-google-id");
    expect(result.versionId).toBeTruthy();
    expect(drive.upload).toHaveBeenCalledWith(expect.objectContaining({
      appProperties: expect.objectContaining({ oePaymentHistorySheetVersionId: result.versionId })
    }));
    await expect(createNewPaymentHistoryVersion({
      patientId: patient.id, sheetId: sheet.id,
      expectedSourceHash: hash("new-xlsx-content"), googleFolderInput: "folder-id"
    })).rejects.toThrow("ya está en Google");
    expect(drive.upload).toHaveBeenCalledTimes(1);
  });

  it("keeps the old Google pointer after a failed upload and adopts the retry by version ID", async () => {
    const { patient, sheet } = await createPaymentFixture();
    drive.find.mockResolvedValueOnce(null).mockImplementation(async () => {
      const pending = await db.paymentHistorySheetVersion.findFirstOrThrow({
        where: { sheetId: sheet.id, uploadStatus: "FAILED" }
      });
      return { id: "recovered-google-id", mimeType: "application/vnd.google-apps.spreadsheet",
        webViewLink: `https://docs.google.com/spreadsheets/d/${pending.id}` };
    });
    drive.upload.mockRejectedValueOnce(new Error("Error de red"));
    const input = { patientId: patient.id, sheetId: sheet.id,
      expectedSourceHash: hash("new-xlsx-content"), googleFolderInput: "folder-id" };
    await expect(createNewPaymentHistoryVersion(input)).rejects.toThrow("Error de red");
    const afterFailure = await db.paymentHistorySheet.findUniqueOrThrow({ where: { id: sheet.id } });
    expect(afterFailure.googleFileId).toBe("old-google-id");
    expect(afterFailure.uploadStatus).toBe("UPLOADED");
    const failedVersions = await db.paymentHistorySheetVersion.findMany({
      where: { sheetId: sheet.id, uploadStatus: "FAILED" }
    });
    expect(failedVersions).toHaveLength(1);

    await createNewPaymentHistoryVersion(input);
    const afterRetry = await db.paymentHistorySheet.findUniqueOrThrow({
      where: { id: sheet.id }, include: { versions: true }
    });
    expect(afterRetry.googleFileId).toBe("recovered-google-id");
    expect(afterRetry.versions).toHaveLength(2);
    expect(drive.upload).toHaveBeenCalledTimes(1);
  });
});
