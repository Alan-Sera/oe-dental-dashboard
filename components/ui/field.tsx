import { cn } from "@/lib/utils";

export function Field({
  label,
  error,
  children,
  className
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2 text-sm text-lavender-100/85", className)}>
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs text-coral-400">{error}</span> : null}
    </label>
  );
}
