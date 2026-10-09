"use server";

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import {
  GoogleDriveRequestError,
  getGoogleOAuthConfig,
  refreshGoogleAccessToken,
  verifyGoogleDriveFolder
} from "@/lib/google-drive";
import { getGoogleDriveRefreshToken } from "@/lib/google-settings";
import {
  ensureDataDirectories,
  getAppDataDir,
  getBackupDir,
  isPathInside,
  normalizePatientsRootPath,
  normalizeStoredRelativePath,
  resolveLinkedAttachmentPath
} from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/actions/audit.actions";
import { GOOGLE_PATIENTS_ROOT_ID, GOOGLE_PATIENTS_ROOT_URL } from "@/lib/google-constants";
import { resolveLocalBackupDatabasePath } from "@/lib/local-backups";

export type ClinicSettings = {
  clinicName: string;
  currency: string;
  networkMode: "single" | "lan-ready";
  patientsRootPath: string;
  googlePatientsRootId: string;
  googlePatientsRootUrl: string;
};

type ClinicSettingsInput = Pick<ClinicSettings, "clinicName" | "currency" | "networkMode"> & {
  patientsRootPath?: string;
};

export type LinkedFilesReport = {
  patientsRootPath: string;
  checked: boolean;
  missingCount: number;
  patientCount: number;
  error?: string;
  groups: Array<{
    patientId: string;
    fullName: string;
    localFolderRelativePath: string | null;
    missingAttachments: Array<{
      id: string;
      originalName: string;
      localRelativePath: string;
      sourceRelativePath: string;
    }>;
  }>;
};

export async function getClinicSettings(): Promise<ClinicSettings> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          "clinic.name",
          "clinic.currency",
          "app.networkMode",
          "files.patientsRootPath"
        ]
      }
    }
  });

  const map = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    clinicName: map.get("clinic.name") ?? "OE Dental",
    currency: map.get("clinic.currency") ?? "MXN",
    networkMode: (map.get("app.networkMode") as ClinicSettings["networkMode"]) ?? "single",
    patientsRootPath: map.get("files.patientsRootPath") ?? process.env.PATIENTS_ROOT_PATH ?? "",
    googlePatientsRootId: GOOGLE_PATIENTS_ROOT_ID,
    googlePatientsRootUrl: GOOGLE_PATIENTS_ROOT_URL
  };
}

export async function updateClinicSettings(settings: ClinicSettingsInput) {
  await requireSession();
  const patientsRootPath = settings.patientsRootPath?.trim()
    ? normalizePatientsRootPath(settings.patientsRootPath)
    : "";

  const updates = [
    prisma.setting.upsert({
      where: { key: "clinic.name" },
      create: { key: "clinic.name", value: settings.clinicName },
      update: { value: settings.clinicName }
    }),
    prisma.setting.upsert({
      where: { key: "clinic.currency" },
      create: { key: "clinic.currency", value: settings.currency.toUpperCase() },
      update: { value: settings.currency.toUpperCase() }
    }),
    prisma.setting.upsert({
      where: { key: "app.networkMode" },
      create: { key: "app.networkMode", value: settings.networkMode },
      update: { value: settings.networkMode }
    }),
    prisma.setting.upsert({
      where: { key: "files.patientsRootPath" },
      create: { key: "files.patientsRootPath", value: patientsRootPath },
      update: { value: patientsRootPath }
    })
  ];

  await prisma.$transaction(updates);

  await recordAudit("settings.updated", "Setting", undefined, {
    ...settings,
    patientsRootPath
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/import");
}

export async function verifyGooglePatientsRoot() {
  await requireSession();
  const config = getGoogleOAuthConfig();
  if (!config) {
    return { ok: false as const, needsReconnect: true, message: "Conecta Google para verificar la carpeta." };
  }

  try {
    const refreshToken = await getGoogleDriveRefreshToken();
    if (!refreshToken) {
      return { ok: false as const, needsReconnect: true, message: "Conecta Google para verificar la carpeta." };
    }
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    const folder = await verifyGoogleDriveFolder(accessToken, GOOGLE_PATIENTS_ROOT_ID);
    return {
      ok: true as const,
      name: folder.name,
      url: folder.webViewLink ?? GOOGLE_PATIENTS_ROOT_URL
    };
  } catch (error) {
    if (error instanceof GoogleDriveRequestError && error.status === 404) {
      return {
        ok: false as const,
        message: "Google aún no permite a OE Dental acceder a esta carpeta. Autoriza Pacientes Chetumal desde Ajustes e inténtalo de nuevo."
      };
    }
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo verificar la carpeta de Drive."
    };
  }
}

export async function getLinkedFilesReport(): Promise<LinkedFilesReport> {
  const settings = await getClinicSettings();
  const emptyReport: LinkedFilesReport = {
    patientsRootPath: settings.patientsRootPath,
    checked: false,
    missingCount: 0,
    patientCount: 0,
    groups: []
  };

  if (!settings.patientsRootPath) {
    return emptyReport;
  }

  try {
    const rootStats = await stat(normalizePatientsRootPath(settings.patientsRootPath));
    if (!rootStats.isDirectory()) {
      return {
        ...emptyReport,
        checked: true,
        error: "La ruta maestra no es una carpeta"
      };
    }
  } catch (error) {
    return {
      ...emptyReport,
      checked: true,
      error: error instanceof Error ? error.message : "No se pudo leer la carpeta maestra"
    };
  }

  const patients = await prisma.patient.findMany({
    where: {
      attachments: {
        some: {}
      }
    },
    include: {
      attachments: {
        orderBy: { importedAt: "desc" }
      }
    },
    orderBy: { fullName: "asc" }
  });

  const groups: LinkedFilesReport["groups"] = [];

  for (const patient of patients) {
    const missingAttachments: LinkedFilesReport["groups"][number]["missingAttachments"] = [];

    for (const attachment of patient.attachments) {
      try {
        const absolutePath = resolveLinkedAttachmentPath({
          patientsRootPath: settings.patientsRootPath,
          patientFolderRelativePath: patient.localFolderRelativePath,
          localRelativePath: attachment.localRelativePath
        });
        const fileStats = await stat(absolutePath);

        if (!fileStats.isFile()) {
          missingAttachments.push(attachment);
        }
      } catch {
        missingAttachments.push(attachment);
      }
    }

    if (missingAttachments.length) {
      groups.push({
        patientId: patient.id,
        fullName: patient.fullName,
        localFolderRelativePath: patient.localFolderRelativePath,
        missingAttachments: missingAttachments.map((attachment) => ({
          id: attachment.id,
          originalName: attachment.originalName,
          localRelativePath: attachment.localRelativePath,
          sourceRelativePath: attachment.sourceRelativePath
        }))
      });
    }
  }

  return {
    patientsRootPath: settings.patientsRootPath,
    checked: true,
    missingCount: groups.reduce((total, group) => total + group.missingAttachments.length, 0),
    patientCount: patients.length,
    groups
  };
}

export async function getPatientMissingAttachmentIds(patientId: string) {
  const settings = await getClinicSettings();

  if (!settings.patientsRootPath) return [];

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { attachments: true }
  });

  if (!patient) return [];

  const missingIds: string[] = [];

  for (const attachment of patient.attachments) {
    try {
      const absolutePath = resolveLinkedAttachmentPath({
        patientsRootPath: settings.patientsRootPath,
        patientFolderRelativePath: patient.localFolderRelativePath,
        localRelativePath: attachment.localRelativePath
      });
      const fileStats = await stat(absolutePath);

      if (!fileStats.isFile()) {
        missingIds.push(attachment.id);
      }
    } catch {
      missingIds.push(attachment.id);
    }
  }

  return missingIds;
}

export async function updatePatientLocalFolderPath(formData: FormData) {
  const patientId = String(formData.get("patientId") ?? "");
  const folderInput = String(formData.get("localFolderRelativePath") ?? "");

  if (!patientId) throw new Error("Paciente inválido");

  const localFolderRelativePath = await normalizePatientFolderInput(folderInput);

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: { localFolderRelativePath }
  });

  await recordAudit("patient.local_folder_updated", "Patient", patientId, {
    localFolderRelativePath
  });
  revalidatePath("/settings");
  revalidatePath(`/patients/${patient.id}`);
}

export async function createLocalBackup() {
  await ensureDataDirectories();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(getBackupDir(), timestamp);
  await mkdir(backupRoot, { recursive: true });

  const dbPath = path.join(getAppDataDir(), "app.db");
  const dbExists = await pathExists(dbPath);
  if (dbExists) {
    await copyFile(dbPath, path.join(backupRoot, "app.db"));
  }

  const settings = await getClinicSettings();

  await writeFile(
    path.join(backupRoot, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        dbIncluded: dbExists,
        linkedFilesIncluded: false,
        patientsRootPath: settings.patientsRootPath || null
      },
      null,
      2
    )
  );

  await recordAudit("backup.created", "Backup", timestamp);
  revalidatePath("/settings");

  return timestamp;
}

export async function listLocalBackups() {
  await ensureDataDirectories();
  const entries = await readdir(getBackupDir(), { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(getBackupDir(), entry.name);
        const info = await stat(fullPath);
        return {
          name: entry.name,
          createdAt: info.birthtime
        };
      })
  );

  return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function restoreLocalBackup(backupName: string) {
  await ensureDataDirectories();

  const dbBackupPath = await resolveLocalBackupDatabasePath(getBackupDir(), backupName);

  await prisma.$disconnect();
  await copyFile(dbBackupPath, path.join(getAppDataDir(), "app.db"));

  await recordAudit("backup.restored", "Backup", backupName);
}

async function normalizePatientFolderInput(folderInput: string) {
  const settings = await getClinicSettings();
  const trimmed = folderInput.trim();

  if (!trimmed) throw new Error("Escribe la carpeta del paciente");

  if (isAbsolutePath(trimmed)) {
    const rootPath = normalizePatientsRootPath(settings.patientsRootPath);
    const absoluteFolder = path.resolve(trimmed);

    if (!isPathInside(rootPath, absoluteFolder)) {
      throw new Error("La carpeta del paciente debe estar dentro de la carpeta maestra");
    }

    return normalizeStoredRelativePath(path.relative(rootPath, absoluteFolder));
  }

  return normalizeStoredRelativePath(trimmed);
}

function isAbsolutePath(value: string) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
