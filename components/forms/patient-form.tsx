"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";

import {
  createPatient,
  updatePatient,
  type CreatePatientResult
} from "@/lib/actions/patient.actions";
import { patientSchema, type PatientInput } from "@/lib/validation";
import { resolveInitialPhoneUnavailable } from "@/lib/patient-provisioning";
import { useGlobalLoading } from "@/components/loading-provider";
import { PatientNextAppointment } from "@/components/patient-attendance-summary";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PatientForm({
  patientId,
  defaultValues
}: {
  patientId?: string;
  defaultValues?: Partial<PatientInput>;
}) {
  const router = useRouter();
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();
  const creationRequestId = useRef(globalThis.crypto?.randomUUID?.() ?? `patient-${Date.now()}`);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    Extract<CreatePatientResult, { kind: "duplicates" }>["candidates"]
  >([]);
  const [pendingValues, setPendingValues] = useState<PatientInput | null>(null);
  const form = useForm<PatientInput>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      phoneUnavailable: resolveInitialPhoneUnavailable({
        patientId,
        phone: defaultValues?.phone,
        phoneUnavailable: defaultValues?.phoneUnavailable
      }),
      birthDate: defaultValues?.birthDate ?? "",
      gender: defaultValues?.gender ?? "",
      notes: defaultValues?.notes ?? ""
    }
  });
  const phoneUnavailable = useWatch({ control: form.control, name: "phoneUnavailable" });
  const phoneField = form.register("phone");

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const digitsOnly = input.value.replace(/\D/g, "");
    if (input.value !== digitsOnly) input.value = digitsOnly;
    void phoneField.onChange(event);
  }

  const phoneInput = (
    <Input
      type="tel"
      inputMode="numeric"
      pattern="[0-9]*"
      disabled={phoneUnavailable}
      {...phoneField}
      onChange={handlePhoneChange}
    />
  );

  function submitCreate(values: PatientInput, confirmedDuplicateIds: string[] = []) {
    setSubmissionError(null);
    loading.show("Preparando expediente del paciente...");
    startTransition(async () => {
      try {
        const result = await createPatient(values, {
          creationRequestId: creationRequestId.current,
          confirmedDuplicateIds
        });
        if (result.kind === "duplicates") {
          setPendingValues(values);
          setDuplicateCandidates(result.candidates);
          return;
        }
        if (result.kind === "error") {
          setSubmissionError(result.message);
          return;
        }
        router.push(`/patients/${result.patientId}`);
      } catch (error) {
        setSubmissionError(error instanceof Error ? error.message : "No se pudo crear el paciente.");
      } finally {
        loading.hide();
      }
    });
  }

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        if (!patientId) {
          submitCreate(values);
          return;
        }

        setSubmissionError(null);
        loading.show("Actualizando paciente...");
        startTransition(async () => {
          try {
            const patient = await updatePatient(patientId, values);
            router.push(`/patients/${patient.id}`);
          } catch (error) {
            setSubmissionError(error instanceof Error ? error.message : "No se pudo actualizar el paciente.");
          } finally {
            loading.hide();
          }
        });
      })}
    >
      <Field label="Nombre completo" error={form.formState.errors.fullName?.message}>
        <Input {...form.register("fullName")} />
      </Field>
      <Field label="Teléfono" error={form.formState.errors.phone?.message}>
        <div className="space-y-2">
          {phoneUnavailable ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    aria-label="Desmarca No se cuenta con teléfono para habilitar este campo"
                    className="block"
                  >
                    {phoneInput}
                  </span>
                }
              />
              <TooltipContent>
                Desmarca «No se cuenta con teléfono» para habilitar este campo.
              </TooltipContent>
            </Tooltip>
          ) : phoneInput}
          <label className="flex items-center gap-2 text-xs text-lavender-200/70">
            <input
              type="checkbox"
              className="size-4 rounded border-lavender-500 bg-lavender-950 "
              {...form.register("phoneUnavailable", {
                onChange: (event) => {
                  if (event.target.checked) form.setValue("phone", "", { shouldValidate: true });
                }
              })}
            />
            No se cuenta con teléfono
          </label>
        </div>
      </Field>
      <Field label="Correo" error={form.formState.errors.email?.message}>
        <Input type="email" {...form.register("email")} />
      </Field>
      <Field label="Fecha de nacimiento" error={form.formState.errors.birthDate?.message}>
        <Input type="date" {...form.register("birthDate")} />
      </Field>
      <Field label="Género" error={form.formState.errors.gender?.message}>
        <Select {...form.register("gender")} className='hover:border-lavender-300/60 hover:bg-lavender-800/50'>
          <option value="">Sin especificar</option>
          <option value="FEMENINO">Femenino</option>
          <option value="MASCULINO">Masculino</option>
        </Select>
      </Field>
      <div className="flex flex-col gap-2 text-sm text-lavender-100/85">
        <span>Próxima cita</span>
        <PatientNextAppointment value={defaultValues?.nextAppointmentDate ?? null} compact />
      </div>
      <Field label="Notas" error={form.formState.errors.notes?.message} className="md:col-span-2">
        <Textarea {...form.register("notes")} className='hover:border-lavender-300/60 hover:bg-lavender-800/50' />
      </Field>
      {!patientId ? (
        <div className="surface md:col-span-2 p-3 text-sm text-lavender-100/80">
          Al crear al paciente se prepararán su carpeta local, historia clínica, historial de pagos y, si Google está disponible, su carpeta de Drive.
        </div>
      ) : null}
      {duplicateCandidates.length > 0 && pendingValues ? (
        <div className="md:col-span-2 rounded-lg border border-amber-400/45 bg-amber-950/35 p-4">
          <p className="font-medium text-amber-200">Encontramos posibles pacientes duplicados</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-100/80">
            {duplicateCandidates.map((candidate) => (
              <li key={candidate.id}>
                <Link className="underline" href={`/patients/${candidate.id}`} target="_blank">
                  {candidate.fullName}
                </Link>
                {candidate.phone ? ` · ${candidate.phone}` : " · Sin teléfono"}
                {candidate.birthDate ? ` · ${candidate.birthDate}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => submitCreate(pendingValues, duplicateCandidates.map((candidate) => candidate.id))}
            >
              Es otra persona; crear de todas formas
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDuplicateCandidates([])}>
              Revisar datos
            </Button>
          </div>
        </div>
      ) : null}
      {submissionError ? (
        <div className="md:col-span-2 rounded-lg border border-coral-400/45 bg-coral-950/35 p-3 text-sm text-coral-200">
          {submissionError}{" "}
          {submissionError.includes("Ajustes") || submissionError.includes("carpeta maestra") ? (
            <Link href="/settings" className="font-medium underline">Abrir Ajustes</Link>
          ) : null}
        </div>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : patientId ? "Actualizar paciente" : "Crear paciente"}
        </Button>
      </div>
    </form>
  );
}
