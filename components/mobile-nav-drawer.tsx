"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Database, Menu, X } from "lucide-react";

import { navigationItems } from "@/constants";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileNavDrawer({
  clinicName,
  currency,
  networkMode
}: {
  clinicName: string;
  currency: string;
  networkMode: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
            className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          <aside
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col border-r border-lavender-500/45 bg-lavender-950 p-5 shadow-panel lg:hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <Link href="/dashboard" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
                <BrandMark size="md" priority />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{clinicName}</p>
                  <p className="text-xs text-lavender-200/75">Odontología especializada</p>
                </div>
              </Link>

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

            <nav className="mt-8 space-y-1" aria-label="Navegación principal">
              {navigationItems.map((item) => {
                const active =
                  pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-md px-3 text-sm transition",
                      active
                        ? "bg-brand-700 text-white ring-1 ring-lavender-300/30"
                        : "text-lavender-200/80 hover:bg-lavender-800/45 hover:text-lavender-50"
                    )}
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-lavender-500/45 bg-lavender-800/30 p-4">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-lavender-200" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-ink-200">Datos locales</p>
                  <p className="text-xs text-lavender-200/60">
                    {currency} · {networkMode}
                  </p>
                </div>
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
