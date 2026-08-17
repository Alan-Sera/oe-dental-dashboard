import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "brand"
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "brand" | "mint" | "amber" | "coral" | "sky";
}) {
  const toneClass = {
    brand: "bg-brand-700 text-lavender-100 ring-1 ring-lavender-300/35",
    mint: "bg-brand-700 text-lavender-100 ring-1 ring-lavender-300/35",
    amber: "bg-amber-900 text-amber-400",
    coral: "bg-coral-900 text-coral-400",
    sky: "bg-lavender-800/80 text-lavender-100 ring-1 ring-lavender-300/35"
  }[tone];

  return (
    <article className="panel grid min-h-32 grid-cols-[1fr_auto] gap-4 p-5">
      <div className="space-y-3">
        <p className="text-sm text-lavender-200/70">{title}</p>
        <p className="text-3xl font-semibold text-white">{value}</p>
        <p className="text-sm text-lavender-200/55">{detail}</p>
      </div>
      <div className={`flex size-11 items-center justify-center rounded-md ${toneClass}`}>
        <Icon className="size-5" aria-hidden="true" />
      </div>
    </article>
  );
}
