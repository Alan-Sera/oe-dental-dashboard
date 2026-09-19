import Image from "next/image";

import { cn } from "@/lib/utils";

export function MuelitaLoader({
  label = "Cargando...",
  compact = false,
  className
}: {
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const width = compact ? 92 : 150;
  const height = compact ? 54 : 88;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-5 text-center", className)}
    >
      <div className={cn("muelita-loader-frame", compact && "muelita-loader-frame-compact")}>
        <div className="muelita-loader-ring" aria-hidden="true" />
        <Image
          src="/assets/brand/muelita-oe.svg"
          alt=""
          width={width}
          height={height}
          priority={!compact}
          unoptimized
          className="muelita-loader-mark"
        />
      </div>
      <p className={cn("text-sm font-medium text-lavender-100", compact && "text-xs")}>
        {label}
      </p>
    </div>
  );
}
