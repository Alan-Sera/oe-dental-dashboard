"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { retryPatientProvisioning } from "@/lib/actions/patient.actions";
import { isProvisioningInProgress } from "@/lib/patient-provisioning";
import type { SerializedPatientDetail } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PatientProvisioningStatus({
  patient
}: {
  patient: Pick<
    SerializedPatientDetail,
    | "id"
    | "createdAt"
    | "provisioningStatus"
    | "provisioningStartedAt"
    | "provisioningError"
    | "googleFolderUrl"
    | "provisioningAttempts"
  >;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (patient.provisioningStatus === "UNMANAGED") return null;

  const ready = patient.provisioningStatus === "READY";
  const working = isProvisioningInProgress(
    patient.provisioningStatus,
    patient.provisioningStartedAt,
    patient.createdAt
  );
  const interrupted =
    (patient.provisioningStatus === "PENDING" || patient.provisioningStatus === "IN_PROGRESS") &&
    !working;
  const title = ready
    ? "Expediente preparado"
    : working
      ? "Preparando expediente"
      : interrupted
        ? "Preparación interrumpida"
        : patient.provisioningStatus === "PARTIAL"
          ? "Expediente local listo; Drive pendiente"
          : "Error al preparar el expediente local";
  const detail =
    error ??
    patient.provisioningError ??
    (interrupted ? "La preparación no se actualizó recientemente. Puedes reintentarla de forma segura." : null);

  return (
    <section className={`surface flex flex-wrap items-center justify-between gap-3 p-4 ${ready ? "border-emerald-400/35" : "border-amber-400/40"}`}>
      <div className="flex min-w-0 items-start gap-3">
        {ready ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden="true" />
        ) : working || isPending ? (
          <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-lavender-200" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden="true" />
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-white">{title}</p>
            <Badge tone={ready ? "mint" : patient.provisioningStatus === "FAILED" ? "coral" : "amber"}>
              {ready
                ? "Listo"
                : patient.provisioningStatus === "FAILED"
                  ? "Error local"
                  : interrupted
                    ? "Requiere reintento"
                    : "Pendiente de Drive"}
            </Badge>
          </div>
          {detail ? <p className="mt-1 text-sm text-lavender-200/70">{detail}</p> : null}
          <p className="mt-1 text-xs text-lavender-200/45">Intentos de preparación: {patient.provisioningAttempts}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {patient.googleFolderUrl ? (
          <Button asChild variant="secondary" size="sm">
            <a href={patient.googleFolderUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              Abrir carpeta en Drive
            </a>
          </Button>
        ) : null}
        {!ready && !working ? (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await retryPatientProvisioning(patient.id);
                if (result.kind === "error") setError(result.message);
                router.refresh();
              });
            }}
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
            Reintentar preparación
          </Button>
        ) : null}
      </div>
    </section>
  );
}
