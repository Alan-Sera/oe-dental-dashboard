"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type PendingEditItem = {
  id: string;
  label: string;
};

export function PendingEditsModal({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: PendingEditItem[];
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex min-h-[100dvh] w-screen items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 min-h-[100dvh] w-screen bg-ink-950/74 backdrop-blur-md"
        aria-label="Cerrar aviso"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="panel relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-hidden border-brand-400/25 bg-lavender-950/96 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-lavender-500/30 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-brand-400/35 bg-brand-950/45 text-brand-100">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-white">
                Primero guarda o cancela tus cambios
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-sm text-lavender-200/62"
              >
                Antes de buscar en la historia, termina los bloques en edición.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 border-brand-400/55 bg-brand-900/60 text-brand-200 backdrop-blur-md hover:bg-brand-500 hover:text-white"
            aria-label="Cerrar aviso"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm font-medium text-lavender-100">
            Bloques editándose:
          </p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-2 rounded-md border border-lavender-500/30 bg-lavender-900/24 px-3 py-2 text-sm text-lavender-100"
              >
                <Pencil
                  className="size-4 shrink-0 text-brand-200"
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end border-t border-lavender-500/25 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
