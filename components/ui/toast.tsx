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
        "oe-toast-root group rounded-lg border border-lavender-500/30 bg-lavender-950/90 shadow-xl shadow-ink-950/40 backdrop-blur-md",
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
      className={cn("text-sm font-semibold text-white", className)}
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
      className={cn("text-xs text-lavender-200/70", className)}
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
        "absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-lavender-300/60 transition hover:bg-lavender-800/50 hover:text-lavender-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60",
        className,
      )}
      {...props}
    >
      <X className="size-3.5" aria-hidden="true" />
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
