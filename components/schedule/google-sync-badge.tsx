"use client";

import Link from "next/link";

import { Cloud } from "lucide-react";
import { CloudOff } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GoogleCalendarStatus } from "@/components/schedule/types";

export function GoogleSyncBadge({ status }: { status: GoogleCalendarStatus }) {
  const presentation = presentStatus(status);

  return (
    <Link
      href="/settings"
      title={presentation.title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:brightness-110",
        presentation.className
      )}
    >
      {presentation.icon}
      <span className="whitespace-nowrap">{presentation.label}</span>
    </Link>
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
      className: cn(base, "border-mint-500/40 bg-mint-900/50 text-mint-200")
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
      className: cn(base, "border-coral-500/40 bg-coral-950/50 text-coral-300")
    };
  }

  return {
    icon: <CloudOff className="size-3.5" aria-hidden="true" />,
    label: "Google no conectado",
    title: "Conecta Google desde Ajustes para sincronizar las citas",
    className: cn(base, "border-lavender-500/30 bg-lavender-900/40 text-lavender-200/70")
  };
}