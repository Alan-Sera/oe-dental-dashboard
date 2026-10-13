"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalShell } from "@/components/modal-shell";
import { PatientForm } from "@/components/forms/patient-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPatientProvisioningReadiness } from "@/lib/actions/patient.actions";
import type { PatientProvisioningReadiness } from "@/lib/services/patient-provisioning";

export function PatientCreateModal() {
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState<PatientProvisioningReadiness | null>(null);
  const [isChecking, startChecking] = useTransition();

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

      <ModalShell
        open={open}
        onOpenChange={setOpen}
        title="Nuevo paciente"
        tone="primary"
        icon={<Plus className="size-5" aria-hidden="true" />}
        iconFramed={false}
        closeLabel="Cerrar formulario"
        size="wide"
      >
        <div className="min-h-0 overflow-y-auto p-5">
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
        </div>
      </ModalShell>
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
      <div className="flex items-center gap-2 text-sm font-medium text-theme-strong">
        {state.ready ? (
          <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        ) : (
          <CircleAlert className={`size-4 ${optional ? "text-amber-800 dark:text-amber-300" : "text-coral-400 dark:text-ink-100"}`} aria-hidden="true" />
        )}
        {label}
      </div>
      <p className="mt-1 text-xs text-lavender-200/55">{state.message}</p>
    </div>
  );
}
