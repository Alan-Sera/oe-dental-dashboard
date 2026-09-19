import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  size = "default"
}: {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <section className={cn("panel", size === "sm" ? "p-3" : "p-5", className)}>
      {children}
    </section>
  );
}

export function CardContent({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (!className) return <>{children}</>;
  return <div className={className}>{children}</div>;
}

export function CardFooter({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-lavender-600/45 pt-3",
        className
      )}
    >
      {children}
    </div>
  );
}
