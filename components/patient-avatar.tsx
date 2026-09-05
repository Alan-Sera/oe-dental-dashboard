import Image from "next/image";

import { cn, initials } from "@/lib/utils";

export function PatientAvatar({
  fullName,
  photoAttachmentId,
  size = "sm",
  className
}: {
  fullName: string;
  photoAttachmentId: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const containerSizes = {
    sm: "size-11",
    md: "size-14",
    lg: "size-16"
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg"
  };

  const imageSizes = {
    sm: "44px",
    md: "56px",
    lg: "64px"
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md bg-lavender-800/70 ring-1 ring-lavender-300/30",
        containerSizes[size],
        className
      )}
    >
      {photoAttachmentId ? (
        <Image
          src={`/api/files/${photoAttachmentId}/preview?w=150&h=150`}
          alt={fullName}
          fill
          sizes={imageSizes[size]}
          className="object-cover"
          unoptimized
        />
      ) : (
        <span className={cn("font-semibold text-lavender-100", textSizes[size])}>
          {initials(fullName)}
        </span>
      )}
    </div>
  );
}
