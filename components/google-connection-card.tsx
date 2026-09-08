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
  error: { error: true, text: "Ocurrió un error al conectar con Google." }
};

export function GoogleConnectionCard({ returnTo }: { returnTo: string }) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const google = new URLSearchParams(window.location.search).get("google");
      if (google) {
        setNotice(GOOGLE_STATUS_MESSAGES[google] ?? GOOGLE_STATUS_MESSAGES.error);
        window.history.replaceState(null, "", window.location.pathname);
      }

      try {
        const response = await fetch("/api/google/status");
        if (!cancelled) {
          setStatus(response.ok ? ((await response.json()) as GoogleCalendarStatus) : null);
        }
      } catch {
        if (!cancelled) setStatus(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const configured = status?.configured ?? false;
  const connected = status?.connected ?? false;
  const needsReconnect = status?.needsReconnect ?? false;
  const calendarScope = status?.calendarScope ?? false;

  const badgeTone = connected ? (calendarScope ? "mint" : "amber") : needsReconnect ? "coral" : "neutral";
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
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-lavender-800/80 text-lavender-100 ring-1 ring-lavender-300/35">
          {connected && calendarScope ? (
            <Cloud className="size-5" aria-hidden="true" />
          ) : (
            <CloudOff className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-lavender-50">Conexión con Google</p>
          <p className="text-sm text-lavender-200/60">
            {connected && calendarScope
              ? "Las citas se sincronizan con Google Calendar."
              : connected && !calendarScope
                ? "Google está conectado, pero falta el permiso de calendario. Reconecta para sincronizar las citas."
                : "Conecta Google para sincronizar las citas con Google Calendar."}
          </p>
          {notice ? (
            <p className={notice.error ? "text-sm text-coral-400" : "text-sm text-ink-200"}>{notice.text}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2">
        <Badge tone={badgeTone}>{badgeText}</Badge>
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