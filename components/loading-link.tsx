"use client";

import Link, { type LinkProps } from "next/link";
import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";

import { useGlobalLoading } from "@/components/loading-provider";
import { useNavigationGuard } from "@/components/navigation-guard-provider";

type LoadingLinkProps = Omit<ComponentProps<typeof Link>, "onNavigate"> & {
  loadingLabel?: string;
  onNavigate?: LinkProps["onNavigate"];
};

export function LoadingLink({
  loadingLabel = "Cargando página...",
  onNavigate,
  ...props
}: LoadingLinkProps) {
  const { startNavigation } = useGlobalLoading();
  const { requestNavigation } = useNavigationGuard();
  const router = useRouter();
  const target = serializeHref(props.href);

  return (
    <Link
      {...props}
      data-navigation-guard-handled="true"
      data-loading-label={loadingLabel}
      onNavigate={(event) => {
        let blockedByGuard = false;
        const continueNavigation = () => {
          let prevented = false;
          onNavigate?.({
            preventDefault: () => {
              prevented = true;
              event.preventDefault();
            },
          });
          if (prevented) return;

          startNavigation(loadingLabel, target);
          if (blockedByGuard) router.push(target);
        };

        const blocked = requestNavigation(continueNavigation, target);

        if (blocked) {
          blockedByGuard = true;
          event.preventDefault();
        }
      }}
    />
  );
}

function serializeHref(href: LinkProps["href"]): string {
  if (typeof href === "string") return href;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) query.append(key, String(item));
      }
    } else if (value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  }

  const search = query.toString();
  const hash = href.hash ? `#${href.hash.replace(/^#/, "")}` : "";
  return `${href.pathname ?? "/"}${search ? `?${search}` : ""}${hash}`;
}
