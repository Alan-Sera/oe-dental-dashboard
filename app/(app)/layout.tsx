import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { hasAdminPassword, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasAdminPassword())) {
    redirect("/setup");
  }

  await requireSession();
  const settings = await getClinicSettings();

  return <AppShell settings={settings}>{children}</AppShell>;
}
