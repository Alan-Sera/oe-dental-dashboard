export const THEME_STORAGE_KEY = "oe-dental-theme";

export type ThemePreference = "light" | "dark";

export function resolveThemePreference(value: string | null | undefined): ThemePreference {
  return value === "dark" ? "dark" : "light";
}
