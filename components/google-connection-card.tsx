"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Cloud } from "lucide-react";
import { CloudOff } from "lucide-react";
import { Loader2 } from "lucide-react";

import type { GoogleCalendarStatus } from "@/components/schedule/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const GOOGLE_STATUS_MESSAGES: Record<string, { error: boolean; text: string }> = {
  connected: { error: false, text: "Google conectado correctamente." },
  "not-configured": { error: true, text: "Google no está configurado en el servidor." },
  "invalid-state": { error: true, text: "La conexión expiró o fue inválida. Intenta de nuevo." },
  "missing-code": { error: true, text: "No se recibió el código de autorización de Google." },
  "missing-refresh-token": {
    error: true,
    text: "Google no devolvió un token de renovación. Reconecta e intenta de nuevo."
  },
  "access-denied": { error: true, text: "Cancelaste la autorización de Google. Puedes intentarlo de nuevo." },
  error: { error: true, text: "Ocurrió un error al conectar con Google." },
  pending: {
    error: false,
    text: "Completa la autorización en el navegador. Esta pantalla se actualizará automáticamente."
  }
};

const DRIVE_STATUS_MESSAGES: Record<string, { error: boolean; text: string }> = {
  connected: { error: false, text: "La carpeta fija de pacientes quedó autorizada en Drive." },
  pending: { error: false, text: "Completa la autorización de Drive en el navegador externo." },
  "access-denied": { error: true, text: "Se canceló la autorización. No se modificó ninguna conexión." },
  "wrong-folder": { error: true, text: "No se autorizó: se seleccionó una carpeta distinta. No se modificaron los tokens." },
  "selection-required": { error: true, text: "No se recibió la selección de Pacientes Chetumal. No se modificaron los tokens." },
  "missing-drive-scope": { error: true, text: "Google no concedió el permiso puntual de Drive requerido." },
  "missing-refresh-token": { error: true, text: "Google no devolvió un token de Drive. Intenta autorizar de nuevo." },
  "not-configured": { error: true, text: "Falta configurar OAuth Desktop en la aplicación." },
  "invalid-state": { error: true, text: "La autorización expiró o fue inválida. Intenta de nuevo." },
  error: { error: true, text: "No se pudo autorizar la carpeta de Drive." }
};

export function GoogleConnectionCard({ returnTo }: { returnTo: string }) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let pollCount = 0;
    let pollingDrive = false;

    const loadStatus = async (drivePending = false) => {
      try {
        const response = await fetch("/api/google/status", { cache: "no-store" });
        if (!cancelled) {
          const nextStatus = response.ok ? ((await response.json()) as GoogleCalendarStatus) : null;
          setStatus(nextStatus);
          if ((drivePending ? nextStatus?.driveConnected : nextStatus?.connected) && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            setNotice(drivePending
              ? DRIVE_STATUS_MESSAGES.connected
              : { error: false, text: "Google conectado correctamente." });
          }
        }
      } catch {
        if (!cancelled) setStatus(null);
      }
    };

    void (async () => {
      const google = new URLSearchParams(window.location.search).get("google");
      const drive = new URLSearchParams(window.location.search).get("drive");
      pollingDrive = drive === "pending";
      if (google) {
        setNotice(GOOGLE_STATUS_MESSAGES[google] ?? GOOGLE_STATUS_MESSAGES.error);
        window.history.replaceState(null, "", window.location.pathname);
        if (google === "pending") intervalId = setInterval(() => void loadStatus(), 2000);
      } else if (drive) {
        setNotice(DRIVE_STATUS_MESSAGES[drive] ?? DRIVE_STATUS_MESSAGES.error);
        window.history.replaceState(null, "", window.location.pathname);
        if (drive === "pending") intervalId = setInterval(() => {
          pollCount += 1;
          if (pollCount > 90 && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            setNotice({ error: true, text: "No se detectó la autorización. Puedes volver a intentarlo." });
          } else void loadStatus(true);
        }, 2000);
      }
      await loadStatus(pollingDrive);
    })();

    const handleFocus = () => void loadStatus(pollingDrive);
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "oe-google-oauth") {
        if (event.data?.key === "drive") setNotice(DRIVE_STATUS_MESSAGES[event.data.status] ?? DRIVE_STATUS_MESSAGES.error);
        void loadStatus();
      }
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("message", handleMessage);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const configured = status?.configured ?? false;
  const connected = status?.connected ?? false;
  const needsReconnect = status?.needsReconnect ?? false;
  const calendarScope = status?.calendarScope ?? false;

  const badgeTone = connected ? (calendarScope ? "green" : "amber") : needsReconnect ? "coral" : "neutral";
  const badgeText = connected
    ? calendarScope
      ? "Google sincronizado"
      : "Falta permiso de calendario"
    : needsReconnect
      ? "Reconexión requerida"
      : configured
        ? "Google sin conectar"
        : "Google no configurado";

  let buttonLabel = "Conectar Google";
  if (connected && !calendarScope) buttonLabel = "Reconectar para dar permiso de calendario";
  else if (connected && calendarScope) buttonLabel = "Reconectar Google";
  else if (needsReconnect) buttonLabel = "Reconectar Google";

  return (
    <div className="surface grid gap-4 p-4 md:grid-cols-[1fr_auto]">
      <div className="flex items-start gap-3">
        {connected && calendarScope ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-lime-950/30 text-lavender-100 ring-1 ring-lavender-300/35">
            <Cloud className="size-5 text-green-400" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md text-lavender-100 ring-1 ring-lavender-300/35">
            <CloudOff className="size-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-lavender-50">Conexión con Google</p>
          <p className="text-sm text-lavender-200/60">
            {connected && calendarScope
              ? "Calendar está conectado. El acceso a la carpeta fija de Drive se autoriza por separado."
              : connected && !calendarScope
                ? "Google está conectado, pero falta el permiso de calendario. Reconecta para sincronizar las citas."
                : "Conecta Google para sincronizar Calendar. El acceso a Drive se autoriza por separado en Ajustes."}
          </p>
          {notice ? (
            <p className={notice.error ? "text-sm text-coral-400" : "text-sm text-ink-200"}>{notice.text}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-row justify-center gap-2">
        <Badge tone={badgeTone}>{badgeText}</Badge>
        <Badge tone={status?.driveConnected ? "green" : status?.driveNeedsReconnect ? "coral" : "neutral"}>
          {status?.driveConnected ? "Drive autorizado" : status?.driveNeedsReconnect ? "Reconectar Drive" : "Drive sin autorizar"}
        </Badge>
        {configured ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/api/google/oauth/start?returnTo=${encodeURIComponent(returnTo)}`}>
              {status === null ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {buttonLabel}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
