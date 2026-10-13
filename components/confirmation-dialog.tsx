"use client";

import type { ReactNode } from "react";

import { ModalShell } from "@/components/modal-shell";

export const confirmationCancelButtonClass =
  "bg-lavender-700/40 text-lavender-50 hover:bg-lavender-700/55 hover:text-theme-strong";

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actions: ReactNode;
  tone: "danger" | "primary";
  icon?: ReactNode;
  itemLabel?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  actions,
  tone,
  icon,
  itemLabel,
  closeLabel = "Cerrar",
  closeDisabled = false,
}: ConfirmationDialogProps) {
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      tone={tone}
      icon={icon}
      description={description}
      closeLabel={closeLabel}
      closeDisabled={closeDisabled}
    >
      {itemLabel ? (
        <div className="shrink-0 border-b border-lavender-500/25 px-5 py-3">
          <p className="truncate text-sm font-medium text-lavender-100">
            {itemLabel}
          </p>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
        {actions}
      </div>
    </ModalShell>
  );
}
