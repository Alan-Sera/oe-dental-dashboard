"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { createClinicalEntry } from "@/lib/actions/clinical.actions";
import { clinicalEntrySchema, type ClinicalEntryInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ClinicalEntryForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<ClinicalEntryInput>({
    resolver: zodResolver(clinicalEntrySchema),
    defaultValues: {
      patientId,
      entryDate: new Date().toISOString().slice(0, 10),
      tooth: "",
      diagnosis: "",
      treatment: "",
      notes: ""
    }
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        startTransition(async () => {
          await createClinicalEntry(values);
          form.reset({ ...values, tooth: "", diagnosis: "", treatment: "", notes: "" });
          router.refresh();
        });
      })}
    >
      <input type="hidden" {...form.register("patientId")} />
      <Field label="Fecha" error={form.formState.errors.entryDate?.message}>
        <Input type="date" {...form.register("entryDate")} />
      </Field>
      <Field label="Pieza dental" error={form.formState.errors.tooth?.message}>
        <Input {...form.register("tooth")} />
      </Field>
      <Field label="Diagnóstico" error={form.formState.errors.diagnosis?.message}>
        <Input {...form.register("diagnosis")} />
      </Field>
      <Field label="Tratamiento" error={form.formState.errors.treatment?.message}>
        <Input {...form.register("treatment")} />
      </Field>
      <Field label="Nota clínica" error={form.formState.errors.notes?.message} className="md:col-span-2">
        <Textarea {...form.register("notes")} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Agregar nota"}
        </Button>
      </div>
    </form>
  );
}
