import Link from "next/link";
import { Database, LogOut, ShieldCheck } from "lucide-react";

import { logout } from "@/lib/actions/auth.actions";
import type { ClinicSettings } from "@/lib/actions/settings.actions";
import { navigationItems } from "@/constants";
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
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-ink-700 bg-ink-900/95 p-5 lg:block">
        <div className="flex h-full flex-col">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-md bg-mint-500 text-ink-950">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">{settings.clinicName}</p>
              <p className="text-xs text-ink-500">Local dental dashboard</p>
            </div>
          </Link>

          <nav className="mt-8 space-y-1">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-11 items-center gap-3 rounded-md px-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-white"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-lg border border-ink-700 bg-ink-850 p-4">
            <div className="flex items-center gap-3">
              <Database className="size-5 text-skyline-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ink-200">Datos locales</p>
                <p className="text-xs text-ink-500">{settings.currency} · {settings.networkMode}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-950/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold lg:hidden">
              <ShieldCheck className="size-5 text-mint-500" aria-hidden="true" />
              {settings.clinicName}
            </Link>
            <div className="hidden text-sm text-ink-500 lg:block">Bóveda local activa</div>
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
