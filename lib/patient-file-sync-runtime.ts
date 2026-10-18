import { watch, type FSWatcher } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";

import { shouldSkipDirectory } from "@/lib/file-import-rules";
import { normalizePatientsRootPath } from "@/lib/local-paths";
import { syncPatientFolder } from "@/lib/patient-file-sync-core";
import { prisma } from "@/lib/prisma";

const ROOT_CHECK_MS = 30_000;
const RECOVERY_SCAN_MS = 6 * 60 * 60 * 1000;
const EVENT_SETTLE_MS = 3_000;
const FALLBACK_SCAN_MS = 15 * 60 * 1000;
const FILE_RETRY_INITIAL_MS = 5_000;
const FILE_RETRY_MAX_MS = 30_000;
const MAX_DISPLAYED_FAILED_PATHS = 50;
const FILE_FAILURE_MESSAGE = "Hay archivos pendientes por errores durante la revisión.";

export function nextFileRetryDelay(previousDelayMs?: number) {
  return previousDelayMs === undefined
    ? FILE_RETRY_INITIAL_MS
    : Math.min(previousDelayMs * 2, FILE_RETRY_MAX_MS);
}

export type PatientFileSyncStatus = {
  mode: "inactive" | "watching" | "scanning" | "error";
  rootPath: string;
  lastCompletedAt: string | null;
  scanned: number;
  linked: number;
  updated: number;
  pendingFolders: number;
  conflictCount: number;
  conflicts: Array<{ folder: string; patientName: string }>;
  failedFileCount: number;
  failedFilePaths: string[];
  error: string | null;
  revision: number;
};

export class PatientFileSyncRuntime {
  private started = false;
  private watcher: FSWatcher | null = null;
  private rootCheckTimer: ReturnType<typeof setInterval> | null = null;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private settleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingFolders = new Set<string>();
  private conflictingFolders = new Set<string>();
  private failedPathsByFolder = new Map<string, string[]>();
  private retryDelaysByFolder = new Map<string, number>();
  private patientRevisions = new Map<string, number>();
  private fullScanRequested = false;
  private running = false;
  private checkingRoot = false;
  private lastFallbackScanAt = 0;
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly synchronizeFolder: typeof syncPatientFolder = syncPatientFolder
  ) {}
  private status: PatientFileSyncStatus = {
    mode: "inactive",
    rootPath: "",
    lastCompletedAt: null,
    scanned: 0,
    linked: 0,
    updated: 0,
    pendingFolders: 0,
    conflictCount: 0,
    conflicts: [],
    failedFileCount: 0,
    failedFilePaths: [],
    error: null,
    revision: 0
  };

  start() {
    if (this.started) return;
    this.started = true;
    this.rootCheckTimer = setInterval(() => void this.refreshRoot(), ROOT_CHECK_MS);
    this.rootCheckTimer.unref();
    this.recoveryTimer = setInterval(() => this.requestFullScan(), RECOVERY_SCAN_MS);
    this.recoveryTimer.unref();
    void this.refreshRoot();
  }

  isStarted() {
    return this.started;
  }

  stop() {
    this.started = false;
    if (this.rootCheckTimer) clearInterval(this.rootCheckTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    this.rootCheckTimer = null;
    this.recoveryTimer = null;
    this.closeWatcher();
    this.clearFailedFiles();
    this.status.mode = "inactive";
  }

  snapshot(): PatientFileSyncStatus {
    const failedPaths = [...this.failedPathsByFolder.values()].flat();
    return {
      ...this.status,
      conflicts: [...this.status.conflicts],
      failedFileCount: failedPaths.length,
      failedFilePaths: failedPaths.slice(0, MAX_DISPLAYED_FAILED_PATHS),
      pendingFolders: this.pendingFolders.size + this.settleTimers.size + (this.running ? 1 : 0)
    };
  }

  revisionForPatient(patientId: string) {
    return this.patientRevisions.get(patientId) ?? 0;
  }

  requestFullScan() {
    if (!this.started || !this.status.rootPath) return false;
    this.fullScanRequested = true;
    void this.drain();
    return true;
  }

  async refreshRoot() {
    if (!this.started || this.checkingRoot) return;
    this.checkingRoot = true;
    try {
      const setting = await this.db.setting.findUnique({ where: { key: "files.patientsRootPath" } });
      const configured = setting?.value || process.env.PATIENTS_ROOT_PATH || "";
      if (!configured) {
        this.closeWatcher();
        this.clearFailedFiles();
        this.status.rootPath = "";
        this.status.mode = "inactive";
        this.status.error = null;
        this.status.conflicts = [];
        this.status.conflictCount = 0;
        this.conflictingFolders.clear();
        return;
      }
      const rootPath = normalizePatientsRootPath(configured);
      const rootStats = await lstat(rootPath);
      if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
        throw new Error("La carpeta maestra no es un directorio local válido.");
      }
      if (this.watcher && this.status.rootPath === rootPath) return;
      if (!this.watcher && this.status.rootPath === rootPath &&
        Date.now() - this.lastFallbackScanAt < FALLBACK_SCAN_MS) {
        try {
          this.watcher = this.createWatcher(rootPath);
          this.status.mode = "watching";
          this.status.error = null;
          this.updateFailedFileStatus();
          this.requestFullScan();
        } catch {
          // The periodic lightweight fallback remains available.
        }
        return;
      }

      if (this.status.rootPath !== rootPath) this.clearFailedFiles();
      this.closeWatcher();
      this.status.rootPath = rootPath;
      this.status.conflicts = [];
      this.status.conflictCount = 0;
      this.conflictingFolders.clear();
      try {
        this.watcher = this.createWatcher(rootPath);
        this.status.mode = "watching";
        this.status.error = null;
      } catch (error) {
        console.warn("[file-sync] La vigilancia no está disponible; se usará la revisión periódica:", error);
        this.status.mode = "error";
        this.status.error = "La vigilancia inmediata no está disponible. Los archivos se revisarán periódicamente.";
      }
      this.updateFailedFileStatus();
      this.lastFallbackScanAt = Date.now();
      this.requestFullScan();
    } catch (error) {
      this.closeWatcher();
      this.clearFailedFiles();
      this.status.rootPath = "";
      this.status.mode = "error";
      this.status.error = error instanceof Error ? error.message : "No se pudo abrir la carpeta maestra.";
    } finally {
      this.checkingRoot = false;
    }
  }

  private createWatcher(rootPath: string) {
    const watcher = watch(rootPath, { recursive: true }, (_event, filename) => {
        if (!filename) {
          this.requestFullScan();
          return;
        }
        const folder = filename.toString().replace(/\\/g, "/").split("/")[0];
        if (folder && !shouldSkipDirectory(folder)) this.scheduleFolder(folder);
    });
    watcher.on("error", (error) => {
        console.error("[file-sync] Observador de archivos:", error);
        this.closeWatcher();
        this.status.mode = "error";
        this.status.error = "Se perdió la vigilancia de la carpeta. Se reintentará automáticamente.";
    });
    return watcher;
  }

  private closeWatcher() {
    this.watcher?.close();
    this.watcher = null;
    this.pendingFolders.clear();
    this.fullScanRequested = false;
    for (const timer of this.settleTimers.values()) clearTimeout(timer);
    this.settleTimers.clear();
  }

  private clearFailedFiles() {
    this.failedPathsByFolder.clear();
    this.retryDelaysByFolder.clear();
    this.status.failedFileCount = 0;
    this.status.failedFilePaths = [];
  }

  private updateFailedFileStatus() {
    const failedCount = [...this.failedPathsByFolder.values()].reduce((count, paths) => count + paths.length, 0);
    if (failedCount) {
      this.status.mode = "error";
      this.status.error = FILE_FAILURE_MESSAGE;
    } else if (this.status.error === FILE_FAILURE_MESSAGE) {
      this.status.error = this.watcher
        ? null
        : "La vigilancia inmediata no está disponible. Los archivos se revisarán periódicamente.";
      if (this.status.mode !== "scanning") this.status.mode = this.watcher ? "watching" : "error";
    }
  }

  private scheduleFailedFolder(folder: string) {
    const delay = nextFileRetryDelay(this.retryDelaysByFolder.get(folder));
    this.retryDelaysByFolder.set(folder, delay);
    this.scheduleFolder(folder, delay);
  }

  private scheduleFolder(folder: string, delay = EVENT_SETTLE_MS) {
    const oldTimer = this.settleTimers.get(folder);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(() => {
      this.settleTimers.delete(folder);
      this.pendingFolders.add(folder);
      void this.drain();
    }, delay);
    timer.unref();
    this.settleTimers.set(folder, timer);
  }

  private async drain() {
    if (this.running || !this.status.rootPath) return;
    this.running = true;
    try {
      while (this.started && this.status.rootPath && (this.fullScanRequested || this.pendingFolders.size)) {
        if (this.fullScanRequested) {
          this.fullScanRequested = false;
          await this.reconcileAll();
          continue;
        }
        const folder = this.pendingFolders.values().next().value;
        if (!folder) break;
        this.pendingFolders.delete(folder);
        await this.reconcileFolder(folder);
      }
    } finally {
      this.running = false;
      if (this.started && this.status.rootPath && (this.fullScanRequested || this.pendingFolders.size)) void this.drain();
    }
  }

  private async reconcileAll() {
    this.status.mode = "scanning";
    const rootPath = this.status.rootPath;
    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      let hadFailure = false;
      const presentFolders = new Set<string>();
      for (const entry of entries) {
        if (rootPath !== this.status.rootPath || !this.started) return;
        if (entry.isDirectory() && !entry.isSymbolicLink() && !shouldSkipDirectory(entry.name)) {
          presentFolders.add(entry.name);
          if (!await this.reconcileFolder(entry.name)) hadFailure = true;
        }
      }
      for (const folder of this.failedPathsByFolder.keys()) {
        if (!presentFolders.has(folder)) {
          this.failedPathsByFolder.delete(folder);
          this.retryDelaysByFolder.delete(folder);
        }
      }
      this.updateFailedFileStatus();
      if (!hadFailure) {
        this.status.lastCompletedAt = new Date().toISOString();
        if (this.watcher) {
          this.status.error = null;
          this.status.mode = "watching";
        } else {
          this.status.mode = "error";
        }
      }
    } catch (error) {
      console.error("[file-sync] Revisión de carpeta:", error);
      this.status.mode = "error";
      this.status.error = "No se pudo completar la revisión de archivos. Se reintentará.";
    }
  }

  private async reconcileFolder(folder: string): Promise<boolean> {
    try {
      const result = await this.synchronizeFolder(this.status.rootPath, folder, this.db);
      this.status.scanned += result.scanned;
      this.status.linked += result.linked;
      this.status.updated += result.updated;
      if (result.linked || result.updated || result.createdPatient) {
        this.status.revision += 1;
        if (result.patientId) {
          this.patientRevisions.set(result.patientId, this.revisionForPatient(result.patientId) + 1);
        }
      }
      if (result.conflict && !this.conflictingFolders.has(folder)) {
        this.conflictingFolders.add(folder);
        this.status.conflictCount = this.conflictingFolders.size;
        if (this.status.conflicts.length < 20) this.status.conflicts.push(result.conflict);
      }
      if (!result.conflict) {
        this.conflictingFolders.delete(folder);
        this.status.conflictCount = this.conflictingFolders.size;
        const existing = this.status.conflicts.findIndex((item) => item.folder === folder);
        if (existing !== -1) {
          this.status.conflicts.splice(existing, 1);
        }
      }
      if (result.failedPaths.length) {
        this.failedPathsByFolder.set(folder, result.failedPaths);
        this.updateFailedFileStatus();
        this.scheduleFailedFolder(folder);
        return false;
      }
      this.failedPathsByFolder.delete(folder);
      this.retryDelaysByFolder.delete(folder);
      this.updateFailedFileStatus();
      if (result.deferred) this.scheduleFolder(folder, 5000);
      if (!this.status.error && this.status.mode !== "scanning") this.status.mode = "watching";
      return true;
    } catch (error) {
      console.error(`[file-sync] No se pudo revisar la carpeta ${folder}:`, error);
      this.failedPathsByFolder.set(folder, [folder]);
      this.updateFailedFileStatus();
      this.scheduleFailedFolder(folder);
      return false;
    }
  }
}

const shared = globalThis as typeof globalThis & { __oePatientFileSync?: PatientFileSyncRuntime };

export function getPatientFileSyncRuntime() {
  shared.__oePatientFileSync ??= new PatientFileSyncRuntime();
  return shared.__oePatientFileSync;
}
