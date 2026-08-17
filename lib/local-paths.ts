import path from "node:path";
import { mkdir } from "node:fs/promises";

import type { AttachmentCategoryValue } from "@/lib/import-classifier";

const categoryFolders: Record<AttachmentCategoryValue, string> = {
  PHOTO: "photos",
  RADIOGRAPH: "radiographs",
  CLINICAL_HISTORY: "clinical-history",
  PAYMENT_RECEIPT: "payment-receipts",
  PAYMENT_HISTORY: "payment-history",
  OTHER: "other"
};

export function getAppDataDir() {
  return path.resolve(process.cwd(), process.env.APP_DATA_DIR ?? "data");
}

export function getVaultDir() {
  return path.join(getAppDataDir(), "vault");
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
    mkdir(getVaultDir(), { recursive: true }),
    mkdir(getBackupDir(), { recursive: true }),
    mkdir(getImportDir(), { recursive: true })
  ]);
}

export function safeFileName(fileName: string) {
  const extension = path.extname(fileName);
  const base = path.basename(fileName, extension);
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return `${safeBase || "archivo"}${extension.toLowerCase()}`;
}

export function buildVaultRelativePath(params: {
  patientId: string;
  category: AttachmentCategoryValue;
  sha256: string;
  originalName: string;
}) {
  const prefix = params.sha256.slice(0, 12);
  const fileName = `${prefix}-${safeFileName(params.originalName)}`;

  return path.join(params.patientId, categoryFolders[params.category], fileName);
}

export function resolveVaultPath(relativePath: string) {
  const vaultDir = getVaultDir();
  const absolutePath = path.resolve(vaultDir, relativePath);

  if (!absolutePath.startsWith(path.resolve(vaultDir))) {
    throw new Error("Invalid vault path");
  }

  return absolutePath;
}
