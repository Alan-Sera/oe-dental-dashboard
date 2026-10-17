import { describe, expect, it } from "vitest";

import { getScreenLoadingBounds } from "../lib/screen-loading-layout";

describe("screen loading layout", () => {
  it("starts content loading after the expanded sidebar by default", () => {
    expect(getScreenLoadingBounds("content")).toBe("fixed inset-0 lg:left-64");
  });

  it("starts content loading after the collapsed sidebar", () => {
    expect(getScreenLoadingBounds("content", true)).toBe(
      "fixed inset-0 lg:left-[4.5rem]",
    );
  });

  it("keeps fullscreen loading independent of the sidebar", () => {
    expect(getScreenLoadingBounds("fullscreen", true)).toBe("fixed inset-0");
  });
});
