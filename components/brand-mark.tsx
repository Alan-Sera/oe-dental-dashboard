import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({
  size = "md",
  className,
  priority = false
}: {
  size?: "sm" | "md" | "lg";
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
