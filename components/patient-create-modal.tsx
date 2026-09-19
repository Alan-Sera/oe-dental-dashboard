"use client";

import { useEffect, useId, useState } from "react";
import { Plus, X } from "lucide-react";

import { PatientForm } from "@/components/forms/patient-form";
import { Button } from "@/components/ui/button";

export function PatientCreateModal() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <Button type="button" disabled onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Nuevo paciente
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm"
            aria-label="Cerrar formulario"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-5 shadow-2xl shadow-ink-950/50"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Plus className="size-5 text-lavender-200" aria-hidden="true" />
                <h2 id={titleId} className="section-title">
                  Nuevo paciente
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar formulario"
                onClick={() => setOpen(false)}
                autoFocus
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <PatientForm />
          </section>
        </div>
      ) : null}
    </>
  );
}
