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

export function FieldGroup({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

export function FieldLabel({
  htmlFor,
  children,
  className
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("text-sm text-lavender-100/85", className)}>
      {children}
    </label>
  );
}

export function FieldDescription({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-xs text-lavender-200/55", className)}>{children}</p>;
}

export function FieldError({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;

  return (
    <p role="alert" className={cn("text-xs text-coral-400", className)}>
      {children}
    </p>
  );
}
