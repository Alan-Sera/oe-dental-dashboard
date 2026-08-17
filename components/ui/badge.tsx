import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "mint" | "amber" | "coral" | "sky";
  className?: string;
}) {
  const tones = {
    neutral: "border-lavender-500/45 bg-lavender-900/45 text-lavender-100",
    brand: "border-brand-400/35 bg-brand-900 text-lavender-100",
    mint: "border-brand-400/35 bg-brand-900 text-lavender-100",
    amber: "border-amber-500/30 bg-amber-900 text-amber-400",
    coral: "border-coral-500/30 bg-coral-900 text-coral-400",
    sky: "border-lavender-300/40 bg-lavender-800/70 text-lavender-100"
  };

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
