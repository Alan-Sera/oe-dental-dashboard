import { MuelitaLoader } from "@/components/muelita-loader";
import { cn } from "@/lib/utils";

type ScreenLoadingOverlayProps = {
  label: string;
  mode?: "content" | "fullscreen";
  fading?: boolean;
};

export function ScreenLoadingOverlay({
  label,
  mode = "content",
  fading = false
}: ScreenLoadingOverlayProps) {
  const bounds = mode === "content" ? "fixed inset-0 lg:left-64" : "fixed inset-0";
  const opacity = fading ? "opacity-0" : "opacity-100";

  return (
    <>
      <div
        className={cn(
          "z-40 bg-white/55 backdrop-blur-sm transition-opacity duration-250 dark:bg-ink-950/55",
          bounds,
          opacity
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "pointer-events-none z-50 flex items-center justify-center px-4 transition-opacity duration-250",
          bounds,
          opacity
        )}
      >
        <MuelitaLoader label={label} />
      </div>
    </>
  );
}
