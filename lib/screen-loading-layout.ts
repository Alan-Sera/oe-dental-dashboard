export type ScreenLoadingMode = "content" | "fullscreen";

export function getScreenLoadingBounds(
  mode: ScreenLoadingMode,
  sidebarCollapsed = false,
): string {
  if (mode === "fullscreen") return "fixed inset-0";

  return sidebarCollapsed
    ? "fixed inset-0 lg:left-[4.5rem]"
    : "fixed inset-0 lg:left-64";
}
