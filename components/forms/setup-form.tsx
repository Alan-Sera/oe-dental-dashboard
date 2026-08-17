"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { setupClinic } from "@/lib/actions/auth.actions";
import { setupSchema, type SetupInput } from "@/lib/validation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SetupForm() {
  const [isPending, startTransition] = useTransition();
  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      clinicName: "OE Dental",
      currency: "MXN",
      password: "",
      confirmPassword: ""
    }
  });

  return (
    <form
      className="panel space-y-5 p-6"
      onSubmit={form.handleSubmit((values) => {
        startTransition(() => setupClinic(values));
      })}
    >
      <div className="space-y-3">
        <BrandMark size="lg" priority />
        <p className="text-sm font-medium text-lavender-200">Primer acceso</p>
        <h1 className="text-2xl font-semibold text-white">Configura la clínica</h1>
      </div>

      <Field label="Clínica" error={form.formState.errors.clinicName?.message}>
        <Input {...form.register("clinicName")} autoComplete="organization" />
      </Field>

      <Field label="Moneda" error={form.formState.errors.currency?.message}>
        <Input {...form.register("currency")} maxLength={3} className="uppercase" />
      </Field>

      <Field label="Contraseña" error={form.formState.errors.password?.message}>
        <Input type="password" {...form.register("password")} autoComplete="new-password" />
      </Field>

      <Field label="Confirmar contraseña" error={form.formState.errors.confirmPassword?.message}>
        <Input type="password" {...form.register("confirmPassword")} autoComplete="new-password" />
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear acceso local"}
      </Button>
    </form>
  );
}
