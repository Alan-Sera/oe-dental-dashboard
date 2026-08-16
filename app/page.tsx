import { redirect } from "next/navigation";

import { getCurrentSession, hasAdminPassword } from "@/lib/auth";
import { isUnsupportedCloudRuntime } from "@/lib/deployment";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isUnsupportedCloudRuntime()) {
    redirect("/deployment");
  }

  if (!(await hasAdminPassword())) {
    redirect("/setup");
  }

  if (await getCurrentSession()) {
    redirect("/dashboard");
  }

  redirect("/login");
}
