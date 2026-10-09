"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PatientForm } from "@/components/forms/patient-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPatientProvisioningReadiness } from "@/lib/actions/patient.actions";
import type { PatientProvisioningReadiness } from "@/lib/services/patient-provisioning";

export function PatientCreateModal() {
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState<PatientProvisioningReadiness | null>(null);
  const [isChecking, startChecking] = useTransition();
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

  useEffect(() => {
    if (!open) return;
    setReadiness(null);
    startChecking(async () => {
      setReadiness(await getPatientProvisioningReadiness());
    });
  }, [open]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}
        className={cn(
          buttonVariants({ variant: "secondary", size: "md" }),
          "min-w-32 border-emerald-300/45 bg-emerald-700/70 px-5 text-white shadow-sm shadow-emerald-950/30 hover:border-emerald-200/70 hover:bg-emerald-600"
        )}
      >
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
                variant="secondary"
                size="icon"
                aria-label="Cerrar formulario"
                className="size-11 border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md hover:bg-coral-500 hover:text-white"
                onClick={() => setOpen(false)}
                autoFocus
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {isChecking || !readiness ? (
                <div className="surface col-span-full flex items-center gap-2 p-3 text-sm text-lavender-200/70">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Verificando carpeta local, plantilla y Google…
                </div>
              ) : (
                <>
                  <ReadinessItem label="Carpeta local" state={readiness.local} />
                  <ReadinessItem label="Plantilla XLSX" state={readiness.template} />
                  <ReadinessItem label="Google Drive" state={readiness.google} optional />
                </>
              )}
            </div>
            <PatientForm />
          </section>
        </div>
      ) : null}
    </>
  );
}

function ReadinessItem({
  label,
  state,
  optional = false
}: {
  label: string;
  state: { ready: boolean; message: string };
  optional?: boolean;
}) {
  return (
    <div className="surface p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        {state.ready ? (
          <CheckCircle2 className="size-4 text-emerald-300" aria-hidden="true" />
        ) : (
          <CircleAlert className={`size-4 ${optional ? "text-amber-300" : "text-coral-300"}`} aria-hidden="true" />
        )}
        {label}
      </div>
      <p className="mt-1 text-xs text-lavender-200/55">{state.message}</p>
    </div>
  );
}
