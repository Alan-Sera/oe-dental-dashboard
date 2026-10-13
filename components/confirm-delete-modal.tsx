"use client";

import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";

import {
  ConfirmationDialog,
  confirmationCancelButtonClass,
} from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";

const deleteButtonClass =
  "border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md hover:bg-coral-500 hover:text-white";

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
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) onCancel();
      }}
      tone="danger"
      title={title}
      description={description}
      itemLabel={itemLabel}
      icon={<AlertTriangle className="size-5 text-red-600" aria-hidden="true" />}
      closeLabel={cancelLabel}
      closeDisabled={isDeleting}
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            className={`w-full sm:w-auto ${confirmationCancelButtonClass}`}
            disabled={isDeleting}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={`w-full sm:w-auto ${deleteButtonClass}`}
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            {isDeleting ? "Eliminando..." : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
