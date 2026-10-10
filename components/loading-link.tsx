"use client";

import Link, { type LinkProps } from "next/link";
import type { ComponentProps } from "react";

import { useGlobalLoading } from "@/components/loading-provider";

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

  return (
    <Link
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);
        startNavigation(
          loadingLabel,
          typeof props.href === "string" ? props.href : undefined,
        );
      }}
    />
  );
}
