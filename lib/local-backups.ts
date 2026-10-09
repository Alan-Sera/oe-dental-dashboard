import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const INVALID_BACKUP_PATH = "Invalid backup path";
const MISSING_DATABASE_FILE = "Backup does not include a database file";

export async function resolveLocalBackupDatabasePath(backupDirectory: string, backupName: string) {
  if (!isSingleDirectoryName(backupName)) {
    throw new Error(INVALID_BACKUP_PATH);
  }

  const realBackupDirectory = await realpath(backupDirectory);
  const backupRoot = path.resolve(realBackupDirectory, backupName);
  if (!isDirectChild(realBackupDirectory, backupRoot)) {
    throw new Error(INVALID_BACKUP_PATH);
  }

  let backupRootInfo;
  try {
    backupRootInfo = await lstat(backupRoot);
  } catch {
    throw new Error("Backup not found");
  }

  if (!backupRootInfo.isDirectory() || backupRootInfo.isSymbolicLink()) {
    throw new Error(INVALID_BACKUP_PATH);
  }

  const realBackupRoot = await realpath(backupRoot);
  if (!isDirectChild(realBackupDirectory, realBackupRoot)) {
    throw new Error(INVALID_BACKUP_PATH);
  }

  const databasePath = path.join(realBackupRoot, "app.db");
  let databaseInfo;
  try {
    databaseInfo = await lstat(databasePath);
  } catch {
    throw new Error(MISSING_DATABASE_FILE);
  }

  if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink()) {
    throw new Error(MISSING_DATABASE_FILE);
  }

  const realDatabasePath = await realpath(databasePath);
  if (!isDirectChild(realBackupRoot, realDatabasePath)) {
    throw new Error(INVALID_BACKUP_PATH);
  }

  return realDatabasePath;
}

function isSingleDirectoryName(value: string) {
  return Boolean(
    typeof value === "string" &&
      value.length > 0 &&
      value !== "." &&
      value !== ".." &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !/[<>:"|?*\u0000-\u001f]/.test(value) &&
      !/[. ]$/.test(value) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) &&
      !path.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !path.posix.isAbsolute(value)
  );
}

function isDirectChild(parentPath: string, childPath: string) {
  const relativePath = path.relative(parentPath, childPath);

  return Boolean(
    relativePath &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath) &&
      path.dirname(relativePath) === "."
  );
}
