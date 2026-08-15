"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { updateClinicSettings, type ClinicSettings } from "@/lib/actions/settings.actions";
import { settingsSchema, type SettingsInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function SettingsForm({ settings }: { settings: ClinicSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-3"
      onSubmit={form.handleSubmit((values) => {
        startTransition(async () => {
          await updateClinicSettings(values);
          router.refresh();
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
      <div className="md:col-span-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar ajustes"}
        </Button>
      </div>
    </form>
  );
}
