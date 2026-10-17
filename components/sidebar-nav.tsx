"use client";

import { usePathname } from "next/navigation";

import { navigationItems } from "@/constants";
import { LoadingLink } from "@/components/loading-link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SidebarNav({
  className,
  itemClassName,
  onNavigate,
  collapsed = false,
}: {
  className?: string;
  itemClassName?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className={cn("space-y-1", className)}
      aria-label="Navegación principal"
    >
      {navigationItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

        const link = (
          <LoadingLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            loadingLabel={`Cargando ${item.label.toLocaleLowerCase("es")}...`}
            className={cn(
              "relative flex h-11 items-center overflow-hidden rounded-md border border-transparent text-sm transition motion-reduce:transition-none",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
              active
                ? "border-brand-300/45 bg-brand-700/65 text-white shadow-[inset_3px_0_0_rgba(24,63,154,0.95),0_10px_28px_rgba(20,16,38,0.24)]"
                : "text-lavender-200/75 hover:bg-lavender-800/45 hover:text-lavender-50",
              itemClassName,
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            <item.icon
              className={cn(
                "size-4 shrink-0 transition",
                collapsed && "mx-auto",
                active ? "text-white dark:text-brand-200" : undefined,
              )}
              aria-hidden="true"
            />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {item.label}
            </span>
          </LoadingLink>
        );

        return collapsed ? (
          <Tooltip key={item.href}>
            <TooltipTrigger render={link} />
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          <div key={item.href}>{link}</div>
        );
      })}
    </nav>
  );
}
