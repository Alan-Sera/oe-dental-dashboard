"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { login } from "@/lib/actions/auth.actions";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { BrandMark } from "@/components/brand-mark";
import { useGlobalLoading } from "@/components/loading-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const loading = useGlobalLoading();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      password: ""
    }
  });

  return (
    <form
      className="panel space-y-5 p-6"
      onSubmit={form.handleSubmit((values) => {
        setMessage("");
        loading.show("Entrando...");
        startTransition(async () => {
          try {
            const result = await login(values);
            if (result?.message) {
              setMessage(result.message);
              loading.hide();
            }
          } catch (error) {
            loading.hide();
            throw error;
          }
        });
      })}
    >
      <div className="space-y-3">
        <BrandMark size="lg" priority />
        <p className="text-sm font-medium text-lavender-200">Odontología Especializada Chetumal</p>
        <h1 className="text-2xl font-semibold text-white">Acceso local</h1>
      </div>

      <Field label="Contraseña" error={form.formState.errors.password?.message}>
        <Input type="password" {...form.register("password")} autoComplete="current-password" />
      </Field>

      {message ? <p className="rounded-md border border-coral-500/30 bg-coral-900 p-3 text-sm text-coral-400">{message}</p> : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
