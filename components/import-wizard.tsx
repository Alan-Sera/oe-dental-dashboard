"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderDown, Loader2, Table2 } from "lucide-react";

import { useGlobalLoading } from "@/components/loading-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type BatchResponse = {
  batch: {
    id: string;
    sourceRootName: string;
    fileCount: number;
    importedCount: number;
    duplicateCount: number;
    errorCount: number;
  };
};

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
};

type GoogleNotice = {
  error: boolean;
  text: string;
};

const GOOGLE_STATUS_MESSAGES: Record<string, GoogleNotice> = {
  connected: { error: false, text: "Google conectado correctamente." },
  "not-configured": { error: true, text: "Google no está configurado en el servidor." },
  "invalid-state": { error: true, text: "La conexión expiró o fue inválida. Intenta de nuevo." },
  "missing-code": { error: true, text: "No se recibió el código de autorización de Google." },
  "missing-refresh-token": {
    error: true,
    text: "Google no devolvió un token de renovación. Reconecta e intenta de nuevo."
  },
  "access-denied": { error: true, text: "Cancelaste la autorización de Google. Puedes intentarlo de nuevo." },
  error: { error: true, text: "Ocurrió un error al conectar con Google." }
};

export function ImportWizard({
  defaultPatientsRootPath = ""
}: {
  defaultPatientsRootPath?: string;
}) {
  const router = useRouter();
  const loading = useGlobalLoading();
  const [patientsRootPath, setPatientsRootPath] = useState(defaultPatientsRootPath);
  const [googleFolderId, setGoogleFolderId] = useState("");
  const [patientsDriveLinks, setPatientsDriveLinks] = useState("");
  const [driveLinksFile, setDriveLinksFile] = useState<File | null>(null);
  const [resetExistingData, setResetExistingData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<BatchResponse["batch"] | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [googleNotice, setGoogleNotice] = useState<GoogleNotice | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const status = new URLSearchParams(window.location.search).get("google");
      if (status) {
        setGoogleNotice(GOOGLE_STATUS_MESSAGES[status] ?? GOOGLE_STATUS_MESSAGES.error);
        window.history.replaceState(null, "", window.location.pathname);
      }

      try {
        const response = await fetch("/api/google/status");
        if (!cancelled) {
          setGoogleStatus(response.ok ? ((await response.json()) as GoogleStatus) : null);
        }
      } catch {
        if (!cancelled) setGoogleStatus(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDriveLinksFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setDriveLinksFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setPatientsDriveLinks(content);
      };
      reader.onerror = () => {
        setError("Error al leer el archivo JSON");
      };
      reader.readAsText(file);
    } else {
      setPatientsDriveLinks("");
    }
  }, []);

  function runImport() {
    if (!patientsRootPath.trim()) return;

    loading.show("Escaneando carpeta maestra...");
    startTransition(async () => {
      try {
        setError("");
        setResult(null);
        setStatus("Escaneando carpeta maestra...");

        const response = await fetch("/api/import/batches", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            patientsRootPath,
            googleFolderId,
            patientsDriveLinks,
            resetExistingData
          })
        });

        const body = (await response.json().catch(() => null)) as BatchResponse | { error?: string } | null;

        if (!response.ok || !body || !("batch" in body)) {
          throw new Error(body && "error" in body && body.error ? body.error : "No se pudo vincular la carpeta");
        }

        setResult(body.batch);
        setStatus("Carpeta vinculada");
        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Error de importación");
        setStatus("");
      } finally {
        loading.hide();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="panel space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-md bg-lavender-800/80 text-lavender-100 ring-1 ring-lavender-300/35">
              <FolderDown className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="section-title">Vincular carpeta maestra</h2>
              <p className="muted">Una subcarpeta directa por paciente</p>
            </div>
          </div>
          <Button type="button" onClick={runImport} disabled={!patientsRootPath.trim() || isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            )}
            Escanear y vincular
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Field label="Carpeta maestra de pacientes">
            <Input
              value={patientsRootPath}
              onChange={(event) => setPatientsRootPath(event.target.value)}
              placeholder="D:\PacientesChetumal"
            />
          </Field>
          <Field label="Google Drive para .xlsx">
            <Input
              value={googleFolderId}
              onChange={(event) => setGoogleFolderId(event.target.value)}
              placeholder="Link o ID de carpeta"
            />
          </Field>
          <Field label="Links de pacientes (.json)">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleDriveLinksFile}
              className="hidden"
              id="drive-links-file"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {driveLinksFile ? driveLinksFile.name : "Seleccionar JSON"}
              </Button>
              {patientsDriveLinks && (
                <span className="text-xs text-green-600">Archivo cargado</span>
              )}
            </div>
          </Field>
        </div>

        <label className="flex items-start gap-3 rounded-md border border-lavender-600/55 bg-lavender-950/25 p-3 text-sm text-lavender-100/85">
          <input
            type="checkbox"
            checked={resetExistingData}
            onChange={(event) => setResetExistingData(event.target.checked)}
            className="mt-1"
          />
          <span>Limpiar datos de prueba antes de importar</span>
        </label>
      </div>

      <div className="surface grid gap-4 p-4 md:grid-cols-[1fr_auto]">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-lavender-800/80 text-lavender-100 ring-1 ring-lavender-300/35">
            <Table2 className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-lavender-50">Historiales de pago .xlsx</p>
            <p className="text-sm text-lavender-200/60">
              Si Google está conectado y agregas una carpeta, se convertirán a Sheets.
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-1">
          <Badge
            tone={googleStatus?.connected ? "brand" : googleStatus?.needsReconnect ? "coral" : "neutral"}
          >
            {googleStatus?.connected
              ? "Google conectado"
              : googleStatus?.needsReconnect
                ? "Reconexión requerida"
                : googleStatus?.configured
                  ? "Google sin conectar"
                  : "Google no configurado"}
          </Badge>
          {googleStatus?.configured && !googleStatus.connected ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/api/google/oauth/start?returnTo=/import">
                {googleStatus.needsReconnect ? "Reconectar Google" : "Conectar Google"}
              </Link>
            </Button>
          ) : null}
          {googleNotice ? (
            <p className={googleNotice.error ? "text-sm text-coral-400" : "text-sm text-ink-200"}>
              {googleNotice.text}
            </p>
          ) : null}
        </div>
      </div>

      {status || error ? (
        <div className="surface p-4">
          <p className={error ? "text-sm text-coral-400" : "text-sm text-ink-300"}>{error || status}</p>
        </div>
      ) : null}

      {result ? (
        <div className="panel grid gap-3 p-5 sm:grid-cols-4">
          <ImportMetric label="Archivos" value={result.fileCount} />
          <ImportMetric label="Nuevos" value={result.importedCount} />
          <ImportMetric label="Ya vinculados" value={result.duplicateCount} />
          <ImportMetric label="Errores" value={result.errorCount} />
        </div>
      ) : null}
    </div>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface p-4">
      <p className="text-sm text-lavender-200/55">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
