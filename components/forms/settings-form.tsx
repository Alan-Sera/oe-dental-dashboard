"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Info } from "lucide-react";

import {
  updateClinicSettings,
  verifyGooglePatientsRoot,
  type ClinicSettings
} from "@/lib/actions/settings.actions";
import { settingsSchema, type SettingsInput } from "@/lib/validation";
import { useGlobalLoading } from "@/components/loading-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

export function SettingsForm({ settings }: { settings: ClinicSettings }) {
  const router = useRouter();
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();
  const [driveVerification, setDriveVerification] = useState<{
    ok: boolean;
    message: string;
    url?: string;
  } | null>(null);
  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      clinicName: settings.clinicName,
      currency: settings.currency,
      networkMode: settings.networkMode,
      patientsRootPath: settings.patientsRootPath
    }
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
      <Field
        label="Carpeta maestra de pacientes"
        error={form.formState.errors.patientsRootPath?.message}
        className="md:col-span-2"
      >
        <Input placeholder="D:\Pacientes Chetumal" {...form.register("patientsRootPath")} />
      </Field>
      <div className="theme-settings-card md:col-span-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-theme-strong">Carpeta de Drive para pacientes</p>
          <Tooltip>
            <TooltipTrigger
              aria-label="Información sobre la carpeta de Drive"
              className="inline-flex size-7 items-center justify-center rounded-lg dark:bg-neutral-900 bg-emerald-700/70 text-neutral-100 shadow-sm transition hover:bg-emerald-700/50 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/70"
            >
              <Info className="size-4 dark:text-green-400 text-white" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Esta carpeta está definida por la clínica y no se cambia desde Ajustes.</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              aria-label="Información sobre la carpeta de Google Drive"
              className="inline-flex size-7 items-center justify-center rounded-lg dark:bg-neutral-900 bg-emerald-700/70 text-neutral-100 shadow-sm transition hover:bg-emerald-700/50 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/70"
            >
              <Info className="size-4 dark:text-green-400 text-white" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              <p>La autorización se completa en el navegador externo y solo da acceso a esta carpeta.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <a className="mt-1 inline-block text-sm text-lavender-200 underline" href={settings.googlePatientsRootUrl} target="_blank" rel="noreferrer">
          Pacientes Chetumal
        </a>
      </div>
      {driveVerification ? (
        <p className={driveVerification.ok ? "md:col-span-3 text-sm text-emerald-700 dark:text-emerald-300" : "md:col-span-3 text-sm text-coral-400 dark:text-lavender-100"}>
          {driveVerification.message}
          {driveVerification.url ? (
            <a className="ml-2 underline" href={driveVerification.url} target="_blank" rel="noreferrer">Abrir carpeta</a>
          ) : null}
        </p>
      ) : null}
      <div className="md:col-span-3">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending} variant="secondary">
            {isPending ? "Guardando..." : "Guardar ajustes"}
          </Button>
          <Button
            variant="secondary"
            asChild
            disabled={isPending}
          >
            <a href={`/api/google/oauth/start?flow=drive-folder-picker&returnTo=${encodeURIComponent("/settings")}`}>
              Autorizar carpeta con Google
            </a>
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              setDriveVerification(null);
              startTransition(async () => {
                const result = await verifyGooglePatientsRoot();
                setDriveVerification({
                  ok: result.ok,
                  message: result.ok ? `Acceso confirmado: ${result.name}` : result.message,
                  url: result.ok ? result.url : undefined
                });
              });
            }}
          >
            Verificar carpeta de Drive
          </Button>
        </div>
      </div>
    </form>
  );
}
