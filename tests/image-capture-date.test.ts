import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  canReadImageCaptureMetadata,
  extractImageCapturedAt,
  readImageCapturedAt,
  extractImageCapturedAtFromBuffer
} from "@/lib/image-capture-date";
import { createExifJpeg, createXmpJpeg } from "./fixtures/image-metadata";

describe("image capture date metadata", () => {
  it("detects image formats that can carry EXIF capture metadata", () => {
    expect(canReadImageCaptureMetadata("20260407_181148.jpg", "image/jpeg")).toBe(true);
    expect(canReadImageCaptureMetadata("panoramica.tiff", null)).toBe(true);
    expect(canReadImageCaptureMetadata("documento.pdf", "application/pdf")).toBe(false);
  });

  it("extracts DateTimeOriginal from a JPEG EXIF segment", () => {
    const capturedAt = extractImageCapturedAtFromBuffer(
      createExifJpeg("2026:04:07 18:11:48")
    );

    expect(capturedAt?.toISOString()).toBe("2026-04-07T18:11:48.000Z");
  });

  it("extracts XMP capture dates when EXIF is not present", () => {
    const capturedAt = extractImageCapturedAtFromBuffer(
      createXmpJpeg("2026-04-07T18:11:48-05:00")
    );

    expect(capturedAt?.toISOString()).toBe("2026-04-07T18:11:48.000Z");
  });

  it("does not confuse a read error with an image that has no EXIF date", async () => {
    const missingPath = path.join(os.tmpdir(), `oe-missing-image-${randomUUID()}.jpg`);
    await expect(readImageCapturedAt(missingPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(extractImageCapturedAt(missingPath)).resolves.toBeNull();
    expect(extractImageCapturedAtFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});
