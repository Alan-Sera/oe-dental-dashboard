"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      role="group"
      aria-label="Seleccionar tema de color"
      className={cn(
        compact
          ? "flex flex-col items-center gap-2 rounded-xl border border-lavender-500/45 bg-lavender-900/75 p-1 shadow-sm transition-colors motion-reduce:transition-none dark:border-lavender-600/60 dark:bg-lavender-950/65"
          : "relative isolate grid min-w-[168px] grid-cols-2 rounded-xl border border-lavender-500/45 bg-lavender-900/75 p-1 shadow-sm transition-colors motion-reduce:transition-none dark:border-lavender-600/60 dark:bg-lavender-950/65",
        className,
      )}
    >
      {!compact ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-brand-600 shadow-md shadow-brand-900/20 transition-transform duration-300 ease-out motion-reduce:transition-none",
            isDark && "translate-x-full",
          )}
        />
      ) : null}
      <Tooltip disabled={!compact}>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-pressed={!isDark}
              aria-label="Modo claro"
              onClick={() => setTheme("light")}
              className={cn(
                "theme-switch-focus relative z-10 flex items-center justify-center rounded-lg text-sm font-medium transition-colors duration-200 motion-reduce:transition-none",
                compact
                  ? cn(
                      "size-11 border",
                      !isDark
                        ? "border-brand-500 bg-brand-600 text-white shadow-md shadow-brand-900/20"
                        : "border-lavender-500/45 bg-lavender-800/30 text-lavender-200 hover:bg-lavender-700/45 hover:text-theme-strong",
                    )
                  : cn(
                      "min-w-0 gap-2 px-2.5 py-2",
                      !isDark
                        ? "text-white"
                        : "text-ink-200 hover:text-theme-strong",
                    ),
              )}
            >
              <Sun
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
                  isDark && "-rotate-45 scale-90",
                )}
              />
              <span className={compact ? "sr-only" : undefined}>Claro</span>
            </button>
          }
        />
        {compact ? <TooltipContent side="right">Claro</TooltipContent> : null}
      </Tooltip>
      <Tooltip disabled={!compact}>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-pressed={isDark}
              aria-label="Modo oscuro"
              onClick={() => setTheme("dark")}
              className={cn(
                "theme-switch-focus relative z-10 flex items-center justify-center rounded-lg text-sm font-medium transition-colors duration-200 motion-reduce:transition-none",
                compact
                  ? cn(
                      "size-11 border",
                      isDark
                        ? "border-brand-500 bg-brand-600 text-white shadow-md shadow-brand-900/20"
                        : "border-lavender-500/45 bg-lavender-800/30 text-lavender-200 hover:bg-lavender-700/45 hover:text-theme-strong",
                    )
                  : cn(
                      "min-w-0 gap-2 px-2.5 py-2",
                      isDark
                        ? "text-white"
                        : "text-ink-200 hover:text-theme-strong",
                    ),
              )}
            >
              <Moon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
                  !isDark && "rotate-45 scale-90",
                )}
              />
              <span className={compact ? "sr-only" : undefined}>Oscuro</span>
            </button>
          }
        />
        {compact ? <TooltipContent side="right">Oscuro</TooltipContent> : null}
      </Tooltip>
    </div>
  );
}
