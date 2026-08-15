import { redirect } from "next/navigation";

import { getCurrentSession, hasAdminPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await hasAdminPassword())) {
    redirect("/setup");
  }

  if (await getCurrentSession()) {
    redirect("/dashboard");
  }

  redirect("/login");
}
