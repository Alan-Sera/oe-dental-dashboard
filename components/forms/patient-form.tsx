"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { createPatient, updatePatient } from "@/lib/actions/patient.actions";
import { patientSchema, type PatientInput } from "@/lib/validation";
import { useGlobalLoading } from "@/components/loading-provider";
import { PatientNextAppointment } from "@/components/patient-attendance-summary";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  const form = useForm<PatientInput>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      birthDate: defaultValues?.birthDate ?? "",
      gender: defaultValues?.gender ?? "",
      notes: defaultValues?.notes ?? ""
    }
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        loading.show(patientId ? "Actualizando paciente..." : "Creando paciente...");
        startTransition(async () => {
          try {
            const patient = patientId
              ? await updatePatient(patientId, values)
              : await createPatient(values);
            router.push(`/patients/${patient.id}`);

            if (patientId) {
              loading.hide();
            }
          } catch (error) {
            loading.hide();
            throw error;
          }
        });
      })}
    >
      <Field label="Nombre completo" error={form.formState.errors.fullName?.message}>
        <Input {...form.register("fullName")} />
      </Field>
      <Field label="Teléfono" error={form.formState.errors.phone?.message}>
        <Input {...form.register("phone")} />
      </Field>
      <Field label="Correo" error={form.formState.errors.email?.message}>
        <Input type="email" {...form.register("email")} />
      </Field>
      <Field label="Fecha de nacimiento" error={form.formState.errors.birthDate?.message}>
        <Input type="date" {...form.register("birthDate")} />
      </Field>
      <Field label="Género" error={form.formState.errors.gender?.message}>
        <Select {...form.register("gender")}>
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
        <Textarea {...form.register("notes")} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : patientId ? "Actualizar paciente" : "Crear paciente"}
        </Button>
      </div>
    </form>
  );
}
