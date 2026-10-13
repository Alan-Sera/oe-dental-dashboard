"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      role="group"
      aria-label="Seleccionar tema de color"
      className={cn(
        "relative isolate grid min-w-[168px] grid-cols-2 rounded-xl border border-lavender-500/45 bg-lavender-900/75 p-1 shadow-sm transition-colors motion-reduce:transition-none dark:border-lavender-600/60 dark:bg-lavender-950/65",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-brand-600 shadow-md shadow-brand-900/20 transition-transform duration-300 ease-out motion-reduce:transition-none",
          isDark && "translate-x-full",
        )}
      />
      <button
        type="button"
        aria-pressed={!isDark}
        onClick={() => setTheme("light")}
        className={cn(
          "theme-switch-focus relative z-10 flex min-w-0 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none",
          !isDark ? "text-white" : "text-ink-200 hover:text-theme-strong",
        )}
      >
        <Sun
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
            isDark && "-rotate-45 scale-90",
          )}
        />
        <span>Claro</span>
      </button>
      <button
        type="button"
        aria-pressed={isDark}
        onClick={() => setTheme("dark")}
        className={cn(
          "theme-switch-focus relative z-10 flex min-w-0 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none",
          isDark ? "text-white" : "text-ink-200 hover:text-theme-strong",
        )}
      >
        <Moon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
            !isDark && "rotate-45 scale-90",
          )}
        />
        <span>Oscuro</span>
      </button>
    </div>
  );
}
