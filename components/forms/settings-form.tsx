"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { updateClinicSettings, type ClinicSettings } from "@/lib/actions/settings.actions";
import { settingsSchema, type SettingsInput } from "@/lib/validation";
import { useGlobalLoading } from "@/components/loading-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function SettingsForm({ settings }: { settings: ClinicSettings }) {
  const router = useRouter();
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();
  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-3"
      onSubmit={form.handleSubmit((values) => {
        loading.show("Guardando ajustes...");
        startTransition(async () => {
          try {
            await updateClinicSettings(values);
            router.refresh();
          } finally {
            loading.hide();
          }
        });
      })}
    >
      <Field label="Clínica" error={form.formState.errors.clinicName?.message}>
        <Input {...form.register("clinicName")} />
      </Field>
      <Field label="Moneda" error={form.formState.errors.currency?.message}>
        <Input maxLength={3} className="uppercase" {...form.register("currency")} />
      </Field>
      <Field label="Modo" error={form.formState.errors.networkMode?.message}>
        <Select {...form.register("networkMode")}>
          <option value="single">Una computadora</option>
          <option value="lan-ready">Preparado para red interna</option>
        </Select>
      </Field>
      <Field
        label="Carpeta maestra de pacientes"
        error={form.formState.errors.patientsRootPath?.message}
        className="md:col-span-3"
      >
        <Input placeholder="D:\Pacientes" {...form.register("patientsRootPath")} />
      </Field>
      <div className="md:col-span-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar ajustes"}
        </Button>
      </div>
    </form>
  );
}
