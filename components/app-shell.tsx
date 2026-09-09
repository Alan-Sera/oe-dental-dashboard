import Link from "next/link";
import { Database } from "lucide-react";

import type { ClinicSettings } from "@/lib/actions/settings.actions";
import { BrandMark } from "@/components/brand-mark";
import { LoadingProvider } from "@/components/loading-provider";
import { LogoutButton } from "@/components/logout-button";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { SidebarNav } from "@/components/sidebar-nav";
import { ToastProviders } from "@/components/toast-providers";

export function AppShell({
  settings,
  children
}: {
  settings: ClinicSettings;
  children: React.ReactNode;
}) {
  return (
    <ToastProviders>
      <div className="min-h-screen bg-ink-950 text-ink-100">
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-lavender-600/60 bg-lavender-900/38 p-2 lg:block">
          <div className="flex h-full flex-col">
            <Link href="/dashboard" className="flex items-center gap-3">
              <BrandMark size="md" priority />
              <div>
                <p className="text-base font-semibold text-white">{settings.clinicName}</p>
                <p className="text-xs text-lavender-200/75">Odontología especializada</p>
              </div>
            </Link>

            <SidebarNav className="mt-8" />

            <div className="mt-auto flex items-stretch gap-3">
              <div className="min-w-0 flex-1 rounded-lg border border-lavender-500/45 bg-lavender-800/30 p-4">
                <div className="flex items-center gap-3">
                  <Database className="size-5 text-lavender-200" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-200">Datos locales</p>
                    <p className="text-xs text-lavender-200/60">{settings.currency} · {settings.networkMode}</p>
                  </div>
                </div>
              </div>

              <LogoutButton
                formClassName="flex self-stretch"
                className="h-auto min-w-[4.75rem] px-3"
              />
            </div>
          </div>
        </aside>

        <div className="lg:pl-60">
          <LoadingProvider mode="content">
            <div className="fixed left-4 top-4 z-30 lg:hidden">
              <MobileNavDrawer
                clinicName={settings.clinicName}
                currency={settings.currency}
                networkMode={settings.networkMode}
              />
            </div>
            <main className="pt-16 lg:pt-0">{children}</main>
          </LoadingProvider>
        </div>
      </div>
    </ToastProviders>
  );
}
