import { describe, expect, it } from "vitest";

import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "../lib/sidebar-preference";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("sidebar collapse preference", () => {
  it("defaults to expanded when there is no saved preference", () => {
    expect(readSidebarCollapsed(createStorage())).toBe(false);
  });

  it("restores the collapsed state and persists later changes", () => {
    const storage = createStorage({ "oe-dental-sidebar-collapsed:v1": "true" });

    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(false, storage);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it("safely falls back when storage is unavailable", () => {
    const storage = {
      getItem() {
        throw new Error("Storage unavailable");
      },
      setItem() {
        throw new Error("Storage unavailable");
      },
    };

    expect(readSidebarCollapsed(storage)).toBe(false);
    expect(() => writeSidebarCollapsed(true, storage)).not.toThrow();
  });
});
