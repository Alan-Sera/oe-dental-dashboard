"use server";

import { redirect } from "next/navigation";

import {
  clearSession,
  createSession,
  hasAdminPassword,
  setAdminPassword,
  validateAdminPassword
} from "@/lib/auth";
import { ensureDataDirectories } from "@/lib/local-paths";
import { recordAudit } from "@/lib/actions/audit.actions";
import { updateClinicSettings } from "@/lib/actions/settings.actions";
import { loginSchema, setupSchema, type LoginInput, type SetupInput } from "@/lib/validation";

export async function setupClinic(input: SetupInput) {
  const parsed = setupSchema.parse(input);
  await ensureDataDirectories();

  if (await hasAdminPassword()) {
    redirect("/dashboard");
  }

  await setAdminPassword(parsed.password);
  await updateClinicSettings({
    clinicName: parsed.clinicName,
    currency: parsed.currency,
    networkMode: "lan-ready"
  });

  await recordAudit("auth.setup", "Setting", undefined, { clinicName: parsed.clinicName });
  await createSession();
  redirect("/dashboard");
}

export async function login(input: LoginInput) {
  const parsed = loginSchema.parse(input);

  if (!(await validateAdminPassword(parsed.password))) {
    return {
      ok: false,
      message: "Contraseña incorrecta"
    };
  }

  await createSession();
  await recordAudit("auth.login", "Session");
  redirect("/dashboard");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
