import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_PREVIEW_WIDTH,
  MAX_IMAGE_PREVIEW_WIDTH,
  MIN_IMAGE_PREVIEW_WIDTH,
  canGenerateImagePreview,
  getImagePreviewCacheKey,
  parseImagePreviewWidth
} from "@/lib/image-preview";

describe("image previews", () => {
  it("parses and clamps requested preview widths", () => {
    expect(parseImagePreviewWidth(null)).toBe(DEFAULT_IMAGE_PREVIEW_WIDTH);
    expect(parseImagePreviewWidth("80")).toBe(MIN_IMAGE_PREVIEW_WIDTH);
    expect(parseImagePreviewWidth("700")).toBe(700);
    expect(parseImagePreviewWidth("4000")).toBe(MAX_IMAGE_PREVIEW_WIDTH);
    expect(parseImagePreviewWidth("not-a-number")).toBe(DEFAULT_IMAGE_PREVIEW_WIDTH);
  });

  it("detects previewable raster images", () => {
    expect(canGenerateImagePreview("photo.jpg", null)).toBe(true);
    expect(canGenerateImagePreview("scan.tiff", null)).toBe(true);
    expect(canGenerateImagePreview("image.bin", "image/png")).toBe(true);
    expect(canGenerateImagePreview("vector.svg", "image/svg+xml")).toBe(false);
    expect(canGenerateImagePreview("report.pdf", "application/pdf")).toBe(false);
  });

  it("changes the cache key when source file metadata changes", () => {
    const firstKey = getImagePreviewCacheKey({
      attachmentId: "attachment-1",
      absolutePath: "C:/Pacientes/Ana/foto.jpg",
      fileSize: 1000,
      modifiedTimeMs: 10,
      width: 520
    });
    const secondKey = getImagePreviewCacheKey({
      attachmentId: "attachment-1",
      absolutePath: "C:/Pacientes/Ana/foto.jpg",
      fileSize: 1001,
      modifiedTimeMs: 10,
      width: 520
    });

    expect(firstKey).not.toBe(secondKey);
  });
});
