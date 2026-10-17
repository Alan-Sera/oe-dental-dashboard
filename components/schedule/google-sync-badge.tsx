"use client";


import { Cloud, CloudOff, LoaderCircle, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GoogleCalendarStatus } from "@/components/schedule/types";
import { LoadingLink } from "@/components/loading-link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function GoogleSyncBadge({
  status,
  checking = false,
  error = false,
  onRetry
}: {
  status?: GoogleCalendarStatus;
  checking?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const presentation = status ? presentStatus(status) : null;
  const commonClassName = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition";

  const target = error ? (
    <button
      type="button"
      onClick={onRetry}
      className={cn(commonClassName, "border-coral-500/40 bg-coral-900/10 text-coral-400 hover:brightness-110 dark:bg-transparent dark:text-ink-100")}
      aria-label="No se pudo verificar Google. Reintentar"
    >
      <RefreshCw className="size-3.5" aria-hidden="true" />
      <span className="whitespace-nowrap">Error · Reintentar</span>
    </button>
  ) : checking || !presentation ? (
    <span role="status" aria-live="polite" className={cn(commonClassName, "border-lavender-500/30 bg-lavender-900/40 text-lavender-200/80")}>
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      <span className="whitespace-nowrap">Verificando…</span>
    </span>
  ) : (
    <LoadingLink
      href="/settings"
      loadingLabel="Cargando ajustes..."
      className={cn(commonClassName, "hover:brightness-110", presentation.className)}
    >
      {presentation.icon}
      <span className="whitespace-nowrap">{presentation.label}</span>
    </LoadingLink>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={target} />
      <TooltipContent>
        {error
          ? "No se pudo comprobar la conexión de Google. Pulsa para intentarlo de nuevo."
          : checking
            ? "Comprobando la conexión y los eventos de Google Calendar."
            : presentation?.title}
      </TooltipContent>
    </Tooltip>
  );
}

function presentStatus(status: GoogleCalendarStatus) {
  const base = "backdrop-blur";

  if (!status.configured) {
    return {
      icon: <CloudOff className="size-3.5" aria-hidden="true" />,
      label: "Google no configurado",
      title: "Configura Google OAuth en las variables de entorno",
      className: cn(base, "border-lavender-500/30 bg-lavender-900/40 text-lavender-200/70")
    };
  }

  if (status.connected && status.calendarScope) {
    return {
      icon: <Cloud className="size-3.5" aria-hidden="true" />,
      label: "Google sincronizado",
      title: "Las citas se sincronizan con Google Calendar",
      className: cn(base, "border-mint-500/40 bg-mint-900/50 text-mint-600 dark:text-ink-100")
    };
  }

  if (status.connected && !status.calendarScope) {
    return {
      icon: <CloudOff className="size-3.5" aria-hidden="true" />,
      label: "Falta permiso de calendario",
      title: "Reconecta Google desde Ajustes para activar la sincronización del calendario",
      className: cn(base, "border-amber-500/40 bg-amber-950/50 text-amber-300")
    };
  }

  if (status.needsReconnect) {
    return {
      icon: <CloudOff className="size-3.5" aria-hidden="true" />,
      label: "Google desconectado",
      title: "El acceso a Google expiró o fue revocado. Reconecta desde Ajustes",
      className: cn(base, "border-coral-500/40 bg-coral-900/10 text-coral-400 dark:bg-transparent dark:text-ink-100")
    };
  }

  return {
    icon: <CloudOff className="size-3.5" aria-hidden="true" />,
    label: "Google no conectado",
    title: "Conecta Google desde Ajustes para sincronizar las citas",
    className: cn(base, "border-lavender-500/30 bg-lavender-900/40 text-lavender-200/70")
  };
}
