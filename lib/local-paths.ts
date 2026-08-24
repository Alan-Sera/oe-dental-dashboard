import { mkdir } from "node:fs/promises";
import path from "node:path";

export function getAppDataDir() {
  return path.resolve(process.cwd(), process.env.APP_DATA_DIR ?? "data");
}

export function getBackupDir() {
  return path.join(getAppDataDir(), "backups");
}

export function getImportDir() {
  return path.join(getAppDataDir(), "imports");
}

export async function ensureDataDirectories() {
  await Promise.all([
    mkdir(getAppDataDir(), { recursive: true }),
    mkdir(getBackupDir(), { recursive: true }),
    mkdir(getImportDir(), { recursive: true })
  ]);
}

export function normalizePatientsRootPath(rootPath: string) {
  const trimmed = rootPath.trim();

  if (!trimmed) {
    throw new Error("Configura la carpeta maestra de pacientes");
  }

  if (!isAbsolutePath(trimmed)) {
    throw new Error("La carpeta maestra debe ser una ruta absoluta");
  }

  return path.resolve(trimmed);
}

export function normalizeStoredRelativePath(relativePath: string) {
  const trimmed = relativePath.trim();

  if (!trimmed || isAbsolutePath(trimmed)) {
    throw new Error("La ruta local debe ser relativa");
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("La ruta local contiene segmentos inválidos");
  }

  return segments.join("/");
}

export function joinStoredRelativePath(...parts: string[]) {
  return parts
    .map((part) => part.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function resolveLinkedAttachmentPath(params: {
  patientsRootPath: string;
  patientFolderRelativePath: string | null;
  localRelativePath: string;
}) {
  if (!params.patientFolderRelativePath) {
    throw new Error("El paciente no tiene carpeta local vinculada");
  }

  const rootPath = normalizePatientsRootPath(params.patientsRootPath);
  const patientFolderRelativePath = normalizeStoredRelativePath(params.patientFolderRelativePath);
  const localRelativePath = normalizeStoredRelativePath(params.localRelativePath);
  const absolutePath = path.resolve(
    rootPath,
    toNativePath(patientFolderRelativePath),
    toNativePath(localRelativePath)
  );

  if (!isPathInside(rootPath, absolutePath)) {
    throw new Error("La ruta local intenta salir de la carpeta maestra");
  }

  return absolutePath;
}

export function isPathInside(parentPath: string, childPath: string) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function isAbsolutePath(value: string) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

function toNativePath(storedRelativePath: string) {
  return storedRelativePath.split("/").join(path.sep);
}
