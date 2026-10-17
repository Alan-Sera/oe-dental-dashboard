"use client";

import { useEffect, useState } from "react";
import { Database, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import type { ClinicSettings } from "@/lib/actions/settings.actions";
import { BrandMark } from "@/components/brand-mark";
import { ClinicName } from "@/components/clinic-name";
import { LoadingProvider } from "@/components/loading-provider";
import { NavigationGuardProvider } from "@/components/navigation-guard-provider";
import { LoadingLink } from "@/components/loading-link";
import { LogoutButton } from "@/components/logout-button";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "@/lib/sidebar-preference";
import { cn } from "@/lib/utils";

export function DesktopAppFrame({
  settings,
  children,
}: {
  settings: ClinicSettings;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setPreferenceLoaded(true));
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, []);

  function toggleSidebar() {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    writeSidebarCollapsed(nextCollapsed);
  }

  const widthTransition = preferenceLoaded
    ? "transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
    : "transition-none";
  const contentTransition = preferenceLoaded
    ? "transition-[padding] duration-300 ease-in-out motion-reduce:transition-none"
    : "transition-none";

  return (
    <LoadingProvider mode="content" sidebarCollapsed={collapsed}>
      <NavigationGuardProvider>
      <>
        <aside
          id="desktop-navigation"
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden border-r border-lavender-600/60 bg-lavender-900/38 p-2 lg:block",
            widthTransition,
            collapsed ? "w-[4.5rem]" : "w-64",
          )}
        >
          <div
            className={cn("flex h-full flex-col", collapsed && "items-center")}
          >
            <div
              className={cn(
                "flex w-full gap-2",
                collapsed
                  ? "flex-col items-center"
                  : "items-center justify-between",
              )}
            >
              <LoadingLink
                href="/dashboard"
                aria-label={settings.clinicName}
                className={cn(
                  "flex min-w-0 items-center",
                  collapsed ? "justify-center" : "flex-1 gap-3",
                )}
                loadingLabel="Cargando inicio..."
              >
                <BrandMark variant="oe" size="md" priority />
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <ClinicName
                      name={settings.clinicName}
                      className="w-full text-sm font-semibold leading-5 text-theme-strong"
                    />
                  </div>
                ) : null}
              </LoadingLink>

              <button
                type="button"
                aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
                aria-expanded={!collapsed}
                aria-controls="desktop-navigation"
                onClick={toggleSidebar}
                className="theme-switch-focus inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-lavender-500/35 bg-lavender-800/35 text-lavender-200 transition hover:bg-lavender-700/50 hover:text-theme-strong motion-reduce:transition-none"
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>

            <SidebarNav
              collapsed={collapsed}
              className={cn("mt-8 w-full", collapsed && "mt-4")}
            />

            <div
              className={cn(
                "mt-auto w-full",
                collapsed && "flex flex-col items-center gap-2",
              )}
            >
              <ThemeToggle
                compact={collapsed}
                className={cn(!collapsed && "mb-3 w-full")}
              />

              {collapsed ? (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Datos locales"
                          className="theme-switch-focus inline-flex size-11 items-center justify-center rounded-lg border border-lavender-500/45 bg-lavender-800/30 text-lavender-200 transition hover:bg-lavender-700/45 hover:text-theme-strong motion-reduce:transition-none"
                        >
                          <Database className="size-5" aria-hidden="true" />
                        </button>
                      }
                    />
                    <TooltipContent
                      side="right"
                      className="flex flex-col items-start"
                    >
                      <span className="font-medium">Datos locales</span>
                      <span>
                        {settings.currency} · {settings.networkMode}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  <LogoutButton
                    iconOnly
                    formClassName="flex w-full justify-center"
                    className="size-11"
                  />
                </>
              ) : (
                <div className="flex items-stretch gap-3">
                  <div className="min-w-0 flex-1 rounded-lg border border-lavender-500/45 bg-lavender-800/30 p-4">
                    <div className="flex items-center gap-3">
                      <Database
                        className="size-5 text-lavender-200"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-200">
                          Datos locales
                        </p>
                        <p className="text-xs text-lavender-200/60">
                          {settings.currency} · {settings.networkMode}
                        </p>
                      </div>
                    </div>
                  </div>
                  <LogoutButton
                    formClassName="flex self-stretch"
                    className="h-auto min-w-[4.75rem] px-3"
                  />
                </div>
              )}
            </div>
          </div>
        </aside>

        <div
          className={cn(
            "lg:pl-64",
            collapsed && "lg:pl-[4.5rem]",
            contentTransition,
          )}
        >
          <div className="fixed left-4 top-4 z-30 lg:hidden">
            <MobileNavDrawer
              clinicName={settings.clinicName}
              currency={settings.currency}
              networkMode={settings.networkMode}
            />
          </div>
          <main className="pt-16 lg:pt-0">{children}</main>
        </div>
      </>
      </NavigationGuardProvider>
    </LoadingProvider>
  );
}
