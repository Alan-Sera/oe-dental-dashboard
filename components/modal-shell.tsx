"use client";

import type { ComponentProps, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ModalShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  tone: "danger" | "primary";
  icon?: ReactNode;
  iconFramed?: boolean;
  description?: string;
  titleAccessory?: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  handle?: ComponentProps<typeof DialogPrimitive.Root>["handle"];
  scrollBehavior?: "content" | "panel";
  size?: "compact" | "medium" | "wide";
};

const toneClasses = {
  danger: {
    panel: "border-coral-400/25",
    icon: "border-coral-400/35 bg-coral-900/10 text-coral-400 dark:bg-transparent dark:text-ink-100",
  },
  primary: {
    panel: "border-brand-400/30",
    icon: "border-brand-400/35 bg-brand-900/10 text-brand-500 dark:bg-transparent dark:text-brand-300",
  },
} satisfies Record<ModalShellProps["tone"], { panel: string; icon: string }>;

const sizeClasses = {
  compact: "max-w-md",
  medium: "max-w-2xl",
  wide: "max-w-3xl",
} satisfies Record<NonNullable<ModalShellProps["size"]>, string>;

export function ModalShell({
  open,
  onOpenChange,
  title,
  children,
  tone,
  icon,
  iconFramed = true,
  description,
  titleAccessory,
  closeLabel = "Cerrar",
  closeDisabled = false,
  handle,
  scrollBehavior = "content",
  size = "compact",
}: ModalShellProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      handle={handle}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && closeDisabled) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[90] bg-white/35 backdrop-blur-md dark:bg-ink-950/76" />
        <DialogPrimitive.Popup
          className={cn(
            "panel fixed left-1/2 top-1/2 z-[90] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 border bg-lavender-950 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
            scrollBehavior === "panel" ? "overflow-y-auto" : "flex flex-col overflow-hidden",
            sizeClasses[size],
            toneClasses[tone].panel,
          )}
        >
          <div
            className={cn(
              "flex shrink-0 justify-between gap-4 border-b border-lavender-500/30 px-5 py-4",
              description ? "items-start" : "items-center",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 flex-1 gap-3",
                description ? "items-start" : "items-center",
              )}
            >
              {icon ? (
                <div
                  className={cn(
                    iconFramed
                      ? "flex size-10 shrink-0 items-center justify-center rounded-md border"
                      : "flex size-5 shrink-0 items-center justify-center text-brand-500 dark:text-brand-300",
                    iconFramed ? toneClasses[tone].icon : undefined,
                  )}
                >
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogPrimitive.Title className="text-base font-semibold text-theme-strong">
                    {title}
                  </DialogPrimitive.Title>
                  {titleAccessory}
                </div>
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-sm text-lavender-200/62">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
            </div>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              disabled={closeDisabled}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md transition hover:bg-coral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300/70 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
