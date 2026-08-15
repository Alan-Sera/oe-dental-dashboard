import { redirect } from "next/navigation";

import { LoginForm } from "@/components/forms/login-form";
import { getCurrentSession, hasAdminPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasAdminPassword())) {
    redirect("/setup");
  }

  if (await getCurrentSession()) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
