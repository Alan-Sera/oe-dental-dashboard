"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;

const ToastPortal = ToastPrimitive.Portal;

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn("oe-toast-viewport", className)}
      {...props}
    />
  );
}

function ToastRoot({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      className={cn(
        "oe-toast-root group rounded-lg border border-ink-400/70 bg-ink-700 shadow-2xl shadow-ink-950/35 ring-1 ring-ink-950/10 backdrop-blur-md transition-[border-color,box-shadow] hover:border-ink-300 dark:border-lavender-500/80 dark:bg-lavender-800 dark:ring-lavender-200/10 dark:hover:border-lavender-300",
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Content>) {
  return (
    <ToastPrimitive.Content
      className={cn(
        "oe-toast-content flex items-start gap-3 p-4 pr-11",
        className,
      )}
      {...props}
    />
  );
}

function ToastTitle({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      className={cn("text-sm font-semibold text-theme-strong", className)}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      className={cn("text-xs text-ink-200 dark:text-lavender-200", className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      className={cn(
        "mt-2 inline-flex h-8 items-center justify-center rounded-md bg-brand-600 px-3 text-xs font-medium text-white transition hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60",
        className,
      )}
      {...props}
    />
  );
}

function ToastClose({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      aria-label="Cerrar"
      className={cn(
        "absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md border border-coral-400/80 bg-coral-900 text-coral-500 shadow-sm transition-colors hover:bg-coral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-700 dark:bg-coral-900/80 dark:text-coral-400 dark:focus-visible:ring-offset-lavender-800",
        className,
      )}
      {...props}
    >
      <X className="size-6" aria-hidden="true" />
    </ToastPrimitive.Close>
  );
}

export {
  ToastProvider,
  ToastPortal,
  ToastViewport,
  ToastRoot,
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  ToastPrimitive,
};
