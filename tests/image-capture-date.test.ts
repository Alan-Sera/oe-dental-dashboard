import { describe, expect, it } from "vitest";

import {
  canReadImageCaptureMetadata,
  extractImageCapturedAtFromBuffer
} from "@/lib/image-capture-date";

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
});

function createExifJpeg(dateText: string) {
  const dateValue = `${dateText}\0`;
  const ifd0Offset = 8;
  const ifd0Size = 2 + 12 + 4;
  const exifIfdOffset = ifd0Offset + ifd0Size;
  const exifIfdSize = 2 + 12 + 4;
  const dateOffset = exifIfdOffset + exifIfdSize;
  const tiff = Buffer.alloc(dateOffset + dateValue.length);

  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0Offset, 4);

  tiff.writeUInt16LE(1, ifd0Offset);
  writeIfdEntry(tiff, ifd0Offset + 2, 0x8769, 4, 1, exifIfdOffset);
  tiff.writeUInt32LE(0, ifd0Offset + 2 + 12);

  tiff.writeUInt16LE(1, exifIfdOffset);
  writeIfdEntry(tiff, exifIfdOffset + 2, 0x9003, 2, dateValue.length, dateOffset);
  tiff.writeUInt32LE(0, exifIfdOffset + 2 + 12);
  tiff.write(dateValue, dateOffset, "ascii");

  return createJpegApp1Segment(Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]));
}

function createXmpJpeg(dateText: string) {
  return createJpegApp1Segment(
    Buffer.from(
      `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:DateTimeOriginal="${dateText}" /></x:xmpmeta>`,
      "utf8"
    )
  );
}

function createJpegApp1Segment(payload: Buffer) {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, payload.length + 2]);
  header.writeUInt16BE(payload.length + 2, 4);

  return Buffer.concat([header, payload, Buffer.from([0xff, 0xd9])]);
}

function writeIfdEntry(
  buffer: Buffer,
  offset: number,
  tag: number,
  type: number,
  count: number,
  valueOrOffset: number
) {
  buffer.writeUInt16LE(tag, offset);
  buffer.writeUInt16LE(type, offset + 2);
  buffer.writeUInt32LE(count, offset + 4);
  buffer.writeUInt32LE(valueOrOffset, offset + 8);
}
