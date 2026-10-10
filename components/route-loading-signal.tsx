"use client";

import { useEffect } from "react";

import { useGlobalLoading } from "@/components/loading-provider";

export function RouteLoadingSignal({ label }: { label: string }) {
  const { startRouteFallback } = useGlobalLoading();

  useEffect(() => startRouteFallback(label), [label, startRouteFallback]);

  return null;
}
