"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FolderSync, RefreshCw } from "lucide-react";

import { requestPatientFileSync } from "@/lib/actions/patient-file-sync.actions";
import type { PatientFileSyncStatus as SyncStatus } from "@/lib/patient-file-sync-runtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DisplayStatus = SyncStatus & { startupPending: boolean };

const MODE_LABELS: Record<SyncStatus["mode"], string> = {
  inactive: "Sin vigilancia",
  watching: "Vigilando",
  scanning: "Revisando",
  error: "Requiere atención"
};

export function PatientFileSyncStatus() {
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/patient-file-sync/status", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo consultar la sincronización.");
      setStatus(await response.json() as DisplayStatus);
      setRequestError(null);
    } catch {
      setRequestError("No se pudo consultar el estado de la sincronización.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function handleReview() {
    setRequestError(null);
    startTransition(async () => {
      try {
        const accepted = await requestPatientFileSync();
        if (!accepted) throw new Error("Abre la app de escritorio y configura la carpeta maestra.");
        await refresh();
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "No se pudo iniciar la revisión.");
      }
    });
  }

  return (
    <div className="surface space-y-3 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-brand-400/30 bg-brand-500/10 text-brand-600 dark:text-brand-200">
            <FolderSync className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-theme-strong">Sincronización automática</p>
            <p className="text-xs text-lavender-200/60">
              {status?.lastCompletedAt
                ? `Última revisión: ${new Date(status.lastCompletedAt).toLocaleString("es-MX")}`
                : "Sin revisión completa todavía"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={status?.mode === "error" ? "coral" : status?.mode === "watching" ? "mint" : "neutral"}>
            {status ? status.startupPending ? "Iniciando vigilancia" : MODE_LABELS[status.mode] : "Consultando"}
          </Badge>
          <Button type="button" variant="secondary" size="sm" onClick={handleReview} disabled={pending || !status?.rootPath}>
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
            Revisar ahora
          </Button>
        </div>
      </div>
      {status ? (
        <p className="text-sm text-lavender-200/70">
          {status.linked} archivo(s) nuevo(s), {status.updated} actualizado(s) en esta sesión
          {status.pendingFolders ? ` · ${status.pendingFolders} carpeta(s) pendiente(s)` : ""}.
        </p>
      ) : null}
      {status?.mode === "inactive" ? (
        <p className="text-sm text-lavender-200/70">
          {status.startupPending
            ? "Electron aún no ha confirmado el inicio de la vigilancia. Reintentará automáticamente."
            : "La vigilancia funciona al abrir OE Dental en Electron con una carpeta maestra configurada."}
        </p>
      ) : null}
      {status?.error || requestError ? (
        <p role="alert" className="rounded-md border border-coral-400/40 bg-coral-500/10 px-3 py-2 text-sm text-coral-700 dark:text-coral-200">
          {status?.error ?? requestError}
        </p>
      ) : null}
      {status?.failedFileCount ? (
        <div className="rounded-md border border-coral-400/40 bg-coral-500/10 px-3 py-2 text-sm text-coral-800 dark:text-coral-200">
          <p className="font-medium">
            {status.failedFileCount} archivo(s) o carpeta(s) pendientes de revisión. Los demás se siguen sincronizando; estas rutas se reintentarán automáticamente.
          </p>
          <ul className="mt-2 max-h-40 list-inside list-disc space-y-1 overflow-auto break-all">
            {status.failedFilePaths.map((filePath) => <li key={filePath}>{filePath}</li>)}
          </ul>
          {status.failedFileCount > status.failedFilePaths.length ? (
            <p className="mt-1">Y {status.failedFileCount - status.failedFilePaths.length} ruta(s) más.</p>
          ) : null}
        </div>
      ) : null}
      {status?.conflictCount ? (
        <div className="rounded-md border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium">{status.conflictCount} carpeta(s) requieren revisión por nombre coincidente.</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {status.conflicts.map((item) => (
              <li key={item.folder}>{item.folder} — coincide con «{item.patientName}». Revisa a qué expediente corresponde; no se vinculó automáticamente.</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
