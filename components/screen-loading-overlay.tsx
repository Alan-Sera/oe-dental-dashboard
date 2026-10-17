import { MuelitaLoader } from "@/components/muelita-loader";
import { getScreenLoadingBounds } from "@/lib/screen-loading-layout";
import { cn } from "@/lib/utils";

type ScreenLoadingOverlayProps = {
  label: string;
  mode?: "content" | "fullscreen";
  sidebarCollapsed?: boolean;
  fading?: boolean;
};

export function ScreenLoadingOverlay({
  label,
  mode = "content",
  sidebarCollapsed = false,
  fading = false,
}: ScreenLoadingOverlayProps) {
  const bounds = getScreenLoadingBounds(mode, sidebarCollapsed);
  const opacity = fading ? "opacity-0" : "opacity-100";

  return (
    <>
      <div
        className={cn(
          "z-40 bg-white/55 backdrop-blur-sm [transition:left_300ms_ease-in-out,opacity_250ms_ease] motion-reduce:transition-none dark:bg-ink-950/55",
          bounds,
          opacity,
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "pointer-events-none z-50 flex items-center justify-center px-4 [transition:left_300ms_ease-in-out,opacity_250ms_ease] motion-reduce:transition-none",
          bounds,
          opacity,
        )}
      >
        <MuelitaLoader label={label} />
      </div>
    </>
  );
}
