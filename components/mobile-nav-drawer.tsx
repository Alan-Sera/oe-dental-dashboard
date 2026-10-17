"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Database, Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ClinicName } from "@/components/clinic-name";
import { LoadingLink } from "@/components/loading-link";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileNavDrawer({
  clinicName,
  currency,
  networkMode
}: {
  clinicName: string;
  currency: string;
  networkMode: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const desktopMediaQuery = window.matchMedia("(min-width: 1024px)");
    if (desktopMediaQuery.matches) {
      setOpen(false);
      return;
    }

    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }

    desktopMediaQuery.addEventListener("change", handleDesktopChange);

    return () => desktopMediaQuery.removeEventListener("change", handleDesktopChange);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const drawer =
    open && mounted
      ? createPortal(
        <>
          <div
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm lg:hidden dark:bg-ink-950/70"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          <aside
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-lavender-500/45 bg-lavender-950 p-5 shadow-panel lg:hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <LoadingLink href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3" onNavigate={() => setOpen(false)} loadingLabel="Cargando inicio...">
                <BrandMark variant="oe" size="md" priority />
                <div className="min-w-0 flex-1">
                  <ClinicName
                    name={clinicName}
                    className="w-full text-base font-semibold leading-6 text-theme-strong"
                  />
                </div>
              </LoadingLink>

              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar menú de navegación"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>

            <SidebarNav className="mt-8" itemClassName="h-12" onNavigate={() => setOpen(false)} />

            <div className="mt-auto">
              <ThemeToggle className="mb-3 w-full justify-start" />
              <div className="flex items-stretch gap-3">
                <div className="min-w-0 flex-1 rounded-lg border border-lavender-500/45 bg-lavender-800/30 p-4">
                  <div className="flex items-center gap-3">
                    <Database className="size-5 text-lavender-200" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-200">Datos locales</p>
                      <p className="text-xs text-lavender-200/60">
                        {currency} · {networkMode}
                      </p>
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
        </>,
        document.body
      )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="lg:hidden"
        aria-label="Abrir menú de navegación"
        aria-controls="mobile-nav-drawer"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      {drawer}
    </>
  );
}
