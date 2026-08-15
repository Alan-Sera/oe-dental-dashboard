import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: React.ReactNode;
  tone?: "neutral" | "mint" | "amber" | "coral" | "sky";
  className?: string;
}) {
  const tones = {
    neutral: "border-ink-700 bg-ink-800 text-ink-300",
    mint: "border-mint-500/30 bg-mint-900 text-mint-500",
    amber: "border-amber-500/30 bg-amber-900 text-amber-400",
    coral: "border-coral-500/30 bg-coral-900 text-coral-400",
    sky: "border-skyline-500/30 bg-skyline-900 text-skyline-400"
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
