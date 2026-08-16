import { redirect } from "next/navigation";

import { SetupForm } from "@/components/forms/setup-form";
import { hasAdminPassword } from "@/lib/auth";
import { isUnsupportedCloudRuntime } from "@/lib/deployment";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (isUnsupportedCloudRuntime()) {
    redirect("/deployment");
  }

  if (await hasAdminPassword()) {
    redirect("/login");
  }

  return <SetupForm />;
}
