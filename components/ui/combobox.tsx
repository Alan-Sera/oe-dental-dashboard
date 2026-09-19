"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input>) {
  return (
    <ComboboxPrimitive.Input
      className={cn(
        "h-10 w-full rounded-md border border-lavender-600/70 bg-lavender-900/30 px-3 text-sm text-ink-100 outline-none transition placeholder:text-lavender-200/40 focus:border-lavender-300 focus:ring-2 focus:ring-lavender-200/35",
        className
      )}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Popup>) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner className="z-[70]" sideOffset={4}>
        <ComboboxPrimitive.Popup
          className={cn(
            "max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-lavender-600/70 bg-lavender-950/95 p-1 shadow-xl shadow-ink-950/50 backdrop-blur-md",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxEmpty({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) {
  // Nota: el root de Empty debe permanecer montado (live region para screen
  // readers). No aplicar padding/margin aquí: solo existe visualmente cuando
  // la lista está vacía, así que el espaciado va en los hijos.
  return (
    <ComboboxPrimitive.Empty
      className={cn("text-center text-sm text-lavender-200/55", className)}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Empty>
  );
}

function ComboboxList(props: React.ComponentProps<typeof ComboboxPrimitive.List>) {
  return <ComboboxPrimitive.List {...props} />;
}

function ComboboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item>) {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded px-2.5 py-2 text-sm text-ink-100 outline-none data-[highlighted]:bg-lavender-800/60 data-[highlighted]:text-white",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="ml-auto shrink-0 text-brand-200">
        <Check className="size-4" aria-hidden="true" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

export { Combobox, ComboboxInput, ComboboxContent, ComboboxEmpty, ComboboxList, ComboboxItem };
