import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "mint"
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "mint" | "amber" | "coral" | "sky";
}) {
  const toneClass = {
    mint: "bg-mint-900 text-mint-500",
    amber: "bg-amber-900 text-amber-400",
    coral: "bg-coral-900 text-coral-400",
    sky: "bg-skyline-900 text-skyline-400"
  }[tone];

  return (
    <article className="panel grid min-h-32 grid-cols-[1fr_auto] gap-4 p-5">
      <div className="space-y-3">
        <p className="text-sm text-ink-400">{title}</p>
        <p className="text-3xl font-semibold text-white">{value}</p>
        <p className="text-sm text-ink-500">{detail}</p>
      </div>
      <div className={`flex size-11 items-center justify-center rounded-md ${toneClass}`}>
        <Icon className="size-5" aria-hidden="true" />
      </div>
    </article>
  );
}
