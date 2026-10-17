import { cn } from "@/lib/utils";

export function ClinicName({
  name,
  className
}: {
  name: string;
  className?: string;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  return (
    <p className={className}>
      {words.length === 3 ? (
        words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className={cn(
              "block w-full whitespace-nowrap",
              index === 1 && "text-center",
              index === 2 && "text-right"
            )}
          >
            {word}
          </span>
        ))
      ) : (
        name
      )}
    </p>
  );
}
