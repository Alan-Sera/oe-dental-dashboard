import { describe, expect, it } from "vitest";

import { resolveThemePreference, THEME_STORAGE_KEY } from "../lib/theme-preference";

describe("theme preference", () => {
  it("uses light mode when there is no saved preference", () => {
    expect(resolveThemePreference(null)).toBe("light");
    expect(resolveThemePreference(undefined)).toBe("light");
  });

  it("restores a saved dark preference", () => {
    expect(resolveThemePreference("dark")).toBe("dark");
  });

  it("falls back to light for unknown values", () => {
    expect(resolveThemePreference("system")).toBe("light");
  });

  it("uses an app-specific local storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("oe-dental-theme");
  });
});
