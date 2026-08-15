"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { createPatient, updatePatient } from "@/lib/actions/patient.actions";
import { patientSchema, type PatientInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PatientForm({
  patientId,
  defaultValues
}: {
  patientId?: string;
  defaultValues?: Partial<PatientInput>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<PatientInput>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      birthDate: defaultValues?.birthDate ?? "",
      notes: defaultValues?.notes ?? ""
    }
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        startTransition(async () => {
          const patient = patientId
            ? await updatePatient(patientId, values)
            : await createPatient(values);
          router.push(`/patients/${patient.id}`);
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
