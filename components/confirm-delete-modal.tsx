"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const deleteButtonClass =
  "border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md hover:bg-coral-500 hover:text-white";
const cancelButtonClass =
  "bg-lavender-700/40 text-lavender-50 hover:bg-lavender-700/55 hover:text-white";

export function ConfirmDeleteModal({
  open,
  title,
  description,
  itemLabel,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  isDeleting = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  itemLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
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
      if (event.key === "Escape" && !isDeleting) {
        onCancel();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleting, onCancel, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex min-h-[100dvh] w-screen items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 min-h-[100dvh] w-screen bg-ink-950/76 backdrop-blur-md"
        aria-label={cancelLabel}
        disabled={isDeleting}
        onClick={onCancel}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="panel relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-hidden border-coral-400/25 bg-lavender-950/96 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-lavender-500/30 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-coral-400/35 bg-coral-950/45 text-coral-200">
              <AlertTriangle
                className="size-5 text-red-600"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-white">
                {title}
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-sm text-lavender-200/62"
              >
                {description}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md hover:bg-coral-500 hover:text-white"
            aria-label={cancelLabel}
            disabled={isDeleting}
            onClick={onCancel}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {itemLabel ? (
          <div className="border-b border-lavender-500/25 px-5 py-3">
            <p className="truncate text-sm font-medium text-lavender-100">
              {itemLabel}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className={cn("w-full sm:w-auto", cancelButtonClass)}
            disabled={isDeleting}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={cn("w-full sm:w-auto", deleteButtonClass)}
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            {isDeleting ? "Eliminando..." : confirmLabel}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
