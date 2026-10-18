import { lstat, readdir, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import {
  shouldSkipDirectory,
  shouldSkipFile,
  guessMimeType,
} from "@/lib/file-import-rules";
import {
  classifyImportCandidate,
  extractPatientName,
} from "@/lib/import-classifier";
import { readImageCapturedAt } from "@/lib/image-capture-date";
import {
  joinStoredRelativePath,
  normalizeStoredRelativePath,
} from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";

export type FileSyncFolderResult = {
  patientId: string | null;
  scanned: number;
  linked: number;
  updated: number;
  deferred: number;
  createdPatient: boolean;
  conflict: { folder: string; patientName: string } | null;
  failedPaths: string[];
};

type FileOperations = {
  readdir: typeof readdir;
  stat: typeof stat;
  waitForSettling?: (absolutePath: string) => Promise<void>;
};

type FileCandidate = {
  name: string;
  absolutePath: string;
  localRelativePath: string;
};

type CheckedFile =
  | { kind: "skip"; candidate: FileCandidate }
  | { kind: "deferred"; candidate: FileCandidate }
  | { kind: "failed"; candidate: FileCandidate; error: unknown }
  | { kind: "ready"; candidate: FileCandidate; stats: Stats };

const MAX_CONCURRENT_FILE_CHECKS = 8;

export function shouldRefreshLinkedFile(
  stored: { sizeBytes: number; sourceModifiedAt: Date | null },
  current: { size: number; mtimeMs: number },
) {
  return (
    stored.sizeBytes !== current.size ||
    stored.sourceModifiedAt?.getTime() !== Math.trunc(current.mtimeMs)
  );
}

export async function syncPatientFolder(
  rootPath: string,
  folderName: string,
  db: PrismaClient = prisma,
  files: FileOperations = { readdir, stat },
): Promise<FileSyncFolderResult> {
  const result: FileSyncFolderResult = {
    patientId: null,
    scanned: 0,
    linked: 0,
    updated: 0,
    deferred: 0,
    createdPatient: false,
    conflict: null,
    failedPaths: [],
  };
  if (
    shouldSkipDirectory(folderName) ||
    folderName.includes("/") ||
    folderName.includes("\\")
  ) {
    return result;
  }

  const storedFolder = normalizeStoredRelativePath(folderName);
  const folderPath = path.join(rootPath, folderName);
  let folderStats;
  try {
    folderStats = await lstat(folderPath);
  } catch (error) {
    if (isNotFound(error)) return result;
    throw error;
  }
  if (!folderStats.isDirectory() || folderStats.isSymbolicLink()) return result;

  let patient = await db.patient.findUnique({
    where: { localFolderRelativePath: storedFolder },
    select: { id: true, fullName: true },
  });
  if (!patient) {
    const patientName = extractPatientName(storedFolder);
    const matchingName = await db.patient.findFirst({
      where: { fullName: patientName },
      select: { id: true },
    });
    if (matchingName) {
      result.conflict = { folder: storedFolder, patientName };
      return result;
    }
    patient = await db.patient.upsert({
      where: { localFolderRelativePath: storedFolder },
      update: {},
      create: {
        fullName: patientName,
        localFolderRelativePath: storedFolder,
        folderAliases: JSON.stringify([patientName, storedFolder]),
      },
      select: { id: true, fullName: true },
    });
    result.createdPatient = true;
    await db.auditLog.create({
      data: {
        event: "patient.created_from_local_folder_sync",
        entity: "Patient",
        entityId: patient.id,
        metadata: JSON.stringify({ folder: storedFolder }),
      },
    });
  }

  const patientId = patient.id;
  result.patientId = patientId;
  const existing = await db.attachment.findMany({
    where: { patientId },
    select: {
      id: true,
      localRelativePath: true,
      sizeBytes: true,
      sourceModifiedAt: true,
      capturedAt: true,
    },
  });
  const byPath = new Map(
    existing.map((item) => [item.localRelativePath, item]),
  );
  const candidates: FileCandidate[] = [];

  function recordFailure(localRelativePath: string, error: unknown) {
    const failedPath = joinStoredRelativePath(storedFolder, localRelativePath);
    result.failedPaths.push(failedPath);
    console.error(`[file-sync] No se pudo revisar ${failedPath}:`, error);
  }

  async function visit(relativeDirectory: string): Promise<void> {
    const absoluteDirectory = relativeDirectory
      ? path.join(folderPath, ...relativeDirectory.split("/"))
      : folderPath;
    const entries = await files.readdir(absoluteDirectory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const localRelativePath = joinStoredRelativePath(
        relativeDirectory,
        entry.name,
      );
      try {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (!shouldSkipDirectory(entry.name)) {
            await visit(localRelativePath);
          }
          continue;
        }
        if (!entry.isFile() || shouldSkipFile(entry.name)) continue;
        candidates.push({
          name: entry.name,
          absolutePath: path.join(absoluteDirectory, entry.name),
          localRelativePath,
        });
      } catch (error) {
        if (isNotFound(error)) continue;
        recordFailure(localRelativePath, error);
      }
    }
  }

  async function checkCandidate(
    candidate: FileCandidate,
  ): Promise<CheckedFile> {
    try {
      const first = await files.stat(candidate.absolutePath);
      if (!first.isFile() || first.size > 2147483647)
        return { kind: "skip", candidate };
      result.scanned += 1;
      const previous = byPath.get(candidate.localRelativePath);
      if (previous && !shouldRefreshLinkedFile(previous, first))
        return { kind: "skip", candidate };

      // Only recent files need a second reading; the wait is bounded by the worker pool.
      if (Date.now() - first.mtimeMs < 5000) {
        if (files.waitForSettling)
          await files.waitForSettling(candidate.absolutePath);
        else await new Promise((resolve) => setTimeout(resolve, 1000));
        const second = await files.stat(candidate.absolutePath);
        if (!second.isFile() || second.size > 2147483647)
          return { kind: "skip", candidate };
        if (second.size !== first.size || second.mtimeMs !== first.mtimeMs) {
          return { kind: "deferred", candidate };
        }
        return { kind: "ready", candidate, stats: second };
      }
      return { kind: "ready", candidate, stats: first };
    } catch (error) {
      return isNotFound(error)
        ? { kind: "skip", candidate }
        : { kind: "failed", candidate, error };
    }
  }

  try {
    await visit("");
  } catch (error) {
    if (!isNotFound(error)) {
      result.failedPaths.push(storedFolder);
      console.error(`[file-sync] No se pudo revisar ${storedFolder}:`, error);
    }
  }

  const checked = await mapWithConcurrency(
    candidates,
    MAX_CONCURRENT_FILE_CHECKS,
    checkCandidate,
  );
  for (const item of checked) {
    if (item.kind === "skip") continue;
    if (item.kind === "deferred") {
      result.deferred += 1;
      continue;
    }
    if (item.kind === "failed") {
      recordFailure(item.candidate.localRelativePath, item.error);
      continue;
    }

    const { name, absolutePath, localRelativePath } = item.candidate;
    const fileStats = item.stats;
    try {
      const previous = byPath.get(localRelativePath);
      const mimeType = guessMimeType(name);
      const sourceRelativePath = joinStoredRelativePath(
        storedFolder,
        localRelativePath,
      );
      const modifiedAt = new Date(Math.trunc(fileStats.mtimeMs));
      if (previous) {
        const capturedAt = await readImageCapturedAt(absolutePath, name, mimeType);
        await db.attachment.update({
          where: { id: previous.id },
          data: {
            originalName: name,
            mimeType,
            sizeBytes: fileStats.size,
            sourceModifiedAt: modifiedAt,
            sourceRelativePath,
            capturedAt,
          },
        });
        result.updated += 1;
        continue;
      }

      const classified = classifyImportCandidate({
        relativePath: sourceRelativePath,
        fileName: name,
        mimeType,
      });
      const category = name.toLowerCase().endsWith(".txt")
        ? "CLINICAL_HISTORY"
        : name.toLowerCase().endsWith(".xlsx")
          ? "PAYMENT_HISTORY"
          : classified.category;
      const capturedAt = await readImageCapturedAt(
        absolutePath,
        name,
        mimeType,
      );
      await db.attachment.upsert({
        where: {
          patientId_localRelativePath: { patientId, localRelativePath },
        },
        update: {
          sizeBytes: fileStats.size,
          sourceModifiedAt: modifiedAt,
          sourceRelativePath,
        },
        create: {
          patientId,
          category,
          originalName: name,
          localRelativePath,
          mimeType,
          sizeBytes: fileStats.size,
          capturedAt,
          sourceModifiedAt: modifiedAt,
          sourceRelativePath,
        },
      });
      result.linked += 1;
    } catch (error) {
      if (!isNotFound(error)) recordFailure(localRelativePath, error);
    }
  }
  return result;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
