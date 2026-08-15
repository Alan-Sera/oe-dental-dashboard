import { redirect } from "next/navigation";

import { SetupForm } from "@/components/forms/setup-form";
import { hasAdminPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAdminPassword()) {
    redirect("/login");
  }

  return <SetupForm />;
}
