"use server";

import { cp, copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { ensureDataDirectories, getAppDataDir, getBackupDir, getVaultDir } from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/actions/audit.actions";

export type ClinicSettings = {
  clinicName: string;
  currency: string;
  networkMode: "single" | "lan-ready";
};

export async function getClinicSettings(): Promise<ClinicSettings> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ["clinic.name", "clinic.currency", "app.networkMode"]
      }
    }
  });

  const map = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    clinicName: map.get("clinic.name") ?? "OE Dental",
    currency: map.get("clinic.currency") ?? "MXN",
    networkMode: (map.get("app.networkMode") as ClinicSettings["networkMode"]) ?? "single"
  };
}

export async function updateClinicSettings(settings: ClinicSettings) {
  await prisma.$transaction([
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
    })
  ]);

  await recordAudit("settings.updated", "Setting", undefined, settings);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
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

  const vaultExists = await pathExists(getVaultDir());
  if (vaultExists) {
    await cp(getVaultDir(), path.join(backupRoot, "vault"), { recursive: true, force: true });
  }

  await writeFile(
    path.join(backupRoot, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        dbIncluded: dbExists,
        vaultIncluded: vaultExists
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

  const backupRoot = path.resolve(getBackupDir(), backupName);
  if (!backupRoot.startsWith(path.resolve(getBackupDir()))) {
    throw new Error("Invalid backup path");
  }

  const dbBackupPath = path.join(backupRoot, "app.db");
  const vaultBackupPath = path.join(backupRoot, "vault");

  if (!(await pathExists(dbBackupPath))) {
    throw new Error("Backup does not include a database file");
  }

  await prisma.$disconnect();
  await copyFile(dbBackupPath, path.join(getAppDataDir(), "app.db"));

  if (await pathExists(vaultBackupPath)) {
    await cp(vaultBackupPath, getVaultDir(), { recursive: true, force: true });
  }

  await recordAudit("backup.restored", "Backup", backupName);
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
