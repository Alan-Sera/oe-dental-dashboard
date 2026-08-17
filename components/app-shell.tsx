import Link from "next/link";
import { Database, LogOut } from "lucide-react";

import { logout } from "@/lib/actions/auth.actions";
import type { ClinicSettings } from "@/lib/actions/settings.actions";
import { navigationItems } from "@/constants";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export function AppShell({
  settings,
  children
}: {
  settings: ClinicSettings;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-lavender-600/60 bg-lavender-900/38 p-5 lg:block">
        <div className="flex h-full flex-col">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandMark size="md" priority />
            <div>
              <p className="text-base font-semibold text-white">{settings.clinicName}</p>
              <p className="text-xs text-lavender-200/75">Odontología especializada</p>
            </div>
          </Link>

          <nav className="mt-8 space-y-1">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-11 items-center gap-3 rounded-md px-3 text-sm text-lavender-200/75 transition hover:bg-lavender-800/45 hover:text-lavender-50"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-lg border border-lavender-500/45 bg-lavender-800/30 p-4">
            <div className="flex items-center gap-3">
              <Database className="size-5 text-lavender-200" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ink-200">Datos locales</p>
                <p className="text-xs text-lavender-200/60">{settings.currency} · {settings.networkMode}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-lavender-600/55 bg-lavender-950/55 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold lg:hidden">
              <BrandMark size="sm" />
              {settings.clinicName}
            </Link>
            <div className="hidden text-sm text-lavender-200/60 lg:block">Bóveda local activa</div>
            <form action={logout}>
              <Button variant="secondary" size="sm" type="submit">
                <LogOut className="size-4" aria-hidden="true" />
                Salir
              </Button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
