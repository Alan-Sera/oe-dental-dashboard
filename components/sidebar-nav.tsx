"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigationItems } from "@/constants";
import { cn } from "@/lib/utils";

export function SidebarNav({
  className,
  itemClassName,
  onNavigate
}: {
  className?: string;
  itemClassName?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("space-y-1", className)} aria-label="Navegación principal">
      {navigationItems.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "relative flex h-11 items-center gap-3 overflow-hidden rounded-md border border-transparent px-3 text-sm transition",
              active
                ? "border-brand-300/45 bg-brand-700/65 text-white shadow-[inset_3px_0_0_rgba(24,63,154,0.95),0_10px_28px_rgba(20,16,38,0.24)]"
                : "text-lavender-200/75 hover:bg-lavender-800/45 hover:text-lavender-50",
              itemClassName
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity",
                active ? "opacity-100" : "opacity-0"
              )}
              aria-hidden="true"
            />
            <item.icon
              className={cn("size-4 transition", active ? "text-brand-200" : undefined)}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
