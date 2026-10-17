import Image from "next/image";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export function BrandMark({
  size = "md",
  variant = "clinic",
  className,
  priority = false
}: {
  size?: "sm" | "md" | "lg";
  variant?: "clinic" | "oe";
  className?: string;
  priority?: boolean;
}) {
  const sizes = {
    sm: "size-9",
    md: "size-12",
    lg: "size-20"
  };

  const dimensions = {
    sm: 36,
    md: 48,
    lg: 80
  };

  if (variant === "oe") {
    const logoMask: CSSProperties = {
      maskImage: "url('/assets/brand/oe.svg')",
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
      WebkitMaskImage: "url('/assets/brand/oe.svg')",
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain"
    };

    return (
      <span
        role="img"
        aria-label="Logotipo OE"
        className={cn("inline-block shrink-0 bg-[#26397b] dark:bg-[#d3c0de]", sizes[size], className)}
        style={logoMask}
      />
    );
  }

  return (
    <Image
      src="/assets/brand/logo-oe.png"
      alt="Odontología Especializada Chetumal"
      width={dimensions[size]}
      height={dimensions[size]}
      priority={priority}
      className={cn("rounded-md object-cover ring-1 ring-lavender-200/45", sizes[size], className)}
    />
  );
}
