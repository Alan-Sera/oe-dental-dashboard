import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveLocalBackupDatabasePath } from "@/lib/local-backups";

describe("resolveLocalBackupDatabasePath", () => {
  let temporaryRoot: string;
  let backupDirectory: string;
  let outsideDirectory: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "oe-dental-backup-test-"));
    backupDirectory = path.join(temporaryRoot, "backups");
    outsideDirectory = path.join(temporaryRoot, "backups-antiguos");
    await Promise.all([
      mkdir(backupDirectory, { recursive: true }),
      mkdir(outsideDirectory, { recursive: true })
    ]);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("accepts an existing backup database in a direct child folder", async () => {
    const backupRoot = path.join(backupDirectory, "2026-10-08T12-00-00-000Z");
    await mkdir(backupRoot);
    await writeFile(path.join(backupRoot, "app.db"), "temporary database");

    const databasePath = path.join(backupRoot, "app.db");
    await expect(
      resolveLocalBackupDatabasePath(backupDirectory, path.basename(backupRoot))
    ).resolves.toBe(await realpath(databasePath));
  });

  it.each([
    "../backups-antiguos",
    "..\\backups-antiguos",
    ".",
    "..",
    "C:relative",
    "backup.",
    "NUL",
    "nested/backup",
    "nested\\backup"
  ])("rejects a non-folder name or traversal path: %s", async (backupName) => {
    await expect(resolveLocalBackupDatabasePath(backupDirectory, backupName)).rejects.toThrow(
      "Invalid backup path"
    );
  });

  it("rejects an absolute backup path", async () => {
    await expect(resolveLocalBackupDatabasePath(backupDirectory, outsideDirectory)).rejects.toThrow(
      "Invalid backup path"
    );
  });

  it("rejects a sibling directory whose name starts with the backup folder name", async () => {
    await writeFile(path.join(outsideDirectory, "app.db"), "outside database");

    await expect(resolveLocalBackupDatabasePath(backupDirectory, "../backups-antiguos")).rejects.toThrow(
      "Invalid backup path"
    );
  });

  it("rejects a backup directory symlink that points outside the backup root", async () => {
    const outsideBackup = path.join(outsideDirectory, "linked-backup");
    await mkdir(outsideBackup);
    await writeFile(path.join(outsideBackup, "app.db"), "outside database");
    await symlink(
      outsideBackup,
      path.join(backupDirectory, "linked-backup"),
      process.platform === "win32" ? "junction" : "dir"
    );

    await expect(resolveLocalBackupDatabasePath(backupDirectory, "linked-backup")).rejects.toThrow(
      "Invalid backup path"
    );
  });

  it("rejects an app.db symlink that points outside its backup", async (context) => {
    const backupRoot = path.join(backupDirectory, "linked-database");
    const outsideDatabase = path.join(outsideDirectory, "app.db");
    await mkdir(backupRoot);
    await writeFile(outsideDatabase, "outside database");

    try {
      await symlink(outsideDatabase, path.join(backupRoot, "app.db"), "file");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
      if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) {
        context.skip("El entorno Windows no permite crear enlaces simbólicos de archivo.");
      }
      throw error;
    }

    await expect(resolveLocalBackupDatabasePath(backupDirectory, "linked-database")).rejects.toThrow(
      "Backup does not include a database file"
    );
  });

  it("rejects a backup without app.db and a non-file app.db entry", async () => {
    const missingDatabaseBackup = path.join(backupDirectory, "missing-database");
    const directoryDatabaseBackup = path.join(backupDirectory, "directory-database");
    await mkdir(missingDatabaseBackup);
    await mkdir(directoryDatabaseBackup);
    await mkdir(path.join(directoryDatabaseBackup, "app.db"));

    await expect(resolveLocalBackupDatabasePath(backupDirectory, "missing-database")).rejects.toThrow(
      "Backup does not include a database file"
    );
    await expect(resolveLocalBackupDatabasePath(backupDirectory, "directory-database")).rejects.toThrow(
      "Backup does not include a database file"
    );
  });
});
