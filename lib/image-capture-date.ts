import { open } from "node:fs/promises";
import path from "node:path";

const METADATA_READ_LIMIT_BYTES = 1024 * 1024;
const TYPE_BYTE_LENGTHS: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8
};

type Endianness = "LE" | "BE";

export async function extractImageCapturedAt(
  filePath: string,
  fileName = path.basename(filePath),
  mimeType?: string | null
) {
  if (!canReadImageCaptureMetadata(fileName, mimeType)) return null;

  try {
    const buffer = await readFileStart(filePath, METADATA_READ_LIMIT_BYTES);
    return extractImageCapturedAtFromBuffer(buffer);
  } catch {
    return null;
  }
}

export function canReadImageCaptureMetadata(fileName: string, mimeType?: string | null) {
  const extension = path.extname(fileName).toLowerCase();
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";

  return (
    normalizedMimeType === "image/jpeg" ||
    normalizedMimeType === "image/tiff" ||
    [".jpg", ".jpeg", ".tif", ".tiff"].includes(extension)
  );
}

export function extractImageCapturedAtFromBuffer(buffer: Buffer) {
  return extractJpegCaptureDate(buffer) ?? extractTiffCaptureDate(buffer);
}

function extractJpegCaptureDate(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (isStandaloneJpegMarker(marker)) continue;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) break;

    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > buffer.length) break;

    if (marker === 0xe1) {
      const segment = buffer.subarray(segmentStart, segmentEnd);
      const exifDate = extractExifApp1CaptureDate(segment);
      const xmpDate = exifDate ?? extractXmpCaptureDate(segment);

      if (xmpDate) return xmpDate;
    }

    offset = segmentEnd;
  }

  return null;
}

function extractExifApp1CaptureDate(segment: Buffer) {
  if (!segment.subarray(0, 6).equals(Buffer.from("Exif\0\0", "ascii"))) {
    return null;
  }

  return extractTiffCaptureDate(segment.subarray(6));
}

function extractTiffCaptureDate(buffer: Buffer) {
  if (buffer.length < 8) return null;

  const byteOrder = buffer.toString("ascii", 0, 2);
  const endianness: Endianness | null = byteOrder === "II" ? "LE" : byteOrder === "MM" ? "BE" : null;
  if (!endianness || readUInt16(buffer, 2, endianness) !== 42) return null;

  const firstIfdOffset = readUInt32(buffer, 4, endianness);
  return extractIfdCaptureDate(buffer, firstIfdOffset, endianness, new Set());
}

function extractIfdCaptureDate(
  buffer: Buffer,
  ifdOffset: number,
  endianness: Endianness,
  visitedOffsets: Set<number>
): Date | null {
  if (ifdOffset < 0 || ifdOffset + 2 > buffer.length || visitedOffsets.has(ifdOffset)) {
    return null;
  }

  visitedOffsets.add(ifdOffset);

  const entryCount = readUInt16(buffer, ifdOffset, endianness);
  const entriesStart = ifdOffset + 2;
  const entriesEnd = entriesStart + entryCount * 12;
  if (entriesEnd + 4 > buffer.length) return null;

  let exifIfdOffset: number | null = null;
  let originalDate: string | null = null;
  let digitizedDate: string | null = null;
  let imageDate: string | null = null;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesStart + index * 12;
    const tag = readUInt16(buffer, entryOffset, endianness);
    const type = readUInt16(buffer, entryOffset + 2, endianness);

    if (tag === 0x8769) {
      exifIfdOffset = readEntryInteger(buffer, entryOffset, type, endianness);
      continue;
    }

    if (type !== 2) continue;

    if (tag === 0x9003) {
      originalDate = readAsciiEntry(buffer, entryOffset, type, endianness);
    } else if (tag === 0x9004) {
      digitizedDate = readAsciiEntry(buffer, entryOffset, type, endianness);
    } else if (tag === 0x0132) {
      imageDate = readAsciiEntry(buffer, entryOffset, type, endianness);
    }
  }

  if (exifIfdOffset !== null) {
    const exifDate: Date | null = extractIfdCaptureDate(
      buffer,
      exifIfdOffset,
      endianness,
      visitedOffsets
    );
    if (exifDate) return exifDate;
  }

  return parseCapturedDateText(originalDate ?? digitizedDate ?? imageDate);
}

function extractXmpCaptureDate(segment: Buffer) {
  const text = segment.toString("utf8");
  const patterns = [
    /\bexif:DateTimeOriginal=["']([^"']+)["']/i,
    /\bphotoshop:DateCreated=["']([^"']+)["']/i,
    /\bxmp:CreateDate=["']([^"']+)["']/i,
    /<exif:DateTimeOriginal>([^<]+)<\/exif:DateTimeOriginal>/i,
    /<photoshop:DateCreated>([^<]+)<\/photoshop:DateCreated>/i,
    /<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/i
  ];

  for (const pattern of patterns) {
    const captured = pattern.exec(text)?.[1];
    const date = parseCapturedDateText(captured);

    if (date) return date;
  }

  return null;
}

function readAsciiEntry(buffer: Buffer, entryOffset: number, type: number, endianness: Endianness) {
  const valueBuffer = readEntryValueBuffer(buffer, entryOffset, type, endianness);
  if (!valueBuffer) return null;

  const nullByteIndex = valueBuffer.indexOf(0);
  const dateText = valueBuffer.subarray(0, nullByteIndex === -1 ? valueBuffer.length : nullByteIndex);

  return dateText.toString("ascii").trim();
}

function readEntryInteger(buffer: Buffer, entryOffset: number, type: number, endianness: Endianness) {
  const valueBuffer = readEntryValueBuffer(buffer, entryOffset, type, endianness);
  if (!valueBuffer) return null;

  if (type === 3 && valueBuffer.length >= 2) return readUInt16(valueBuffer, 0, endianness);
  if (type === 4 && valueBuffer.length >= 4) return readUInt32(valueBuffer, 0, endianness);

  return null;
}

function readEntryValueBuffer(buffer: Buffer, entryOffset: number, type: number, endianness: Endianness) {
  const count = readUInt32(buffer, entryOffset + 4, endianness);
  const byteLength = (TYPE_BYTE_LENGTHS[type] ?? 0) * count;

  if (byteLength <= 0) return null;

  if (byteLength <= 4) {
    return buffer.subarray(entryOffset + 8, entryOffset + 8 + byteLength);
  }

  const valueOffset = readUInt32(buffer, entryOffset + 8, endianness);
  if (valueOffset < 0 || valueOffset + byteLength > buffer.length) {
    return null;
  }

  return buffer.subarray(valueOffset, valueOffset + byteLength);
}

function parseCapturedDateText(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim();
  const match =
    /^(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(normalized) ??
    /^(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/.exec(normalized);

  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return date;
}

function readUInt16(buffer: Buffer, offset: number, endianness: Endianness) {
  return endianness === "LE" ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUInt32(buffer: Buffer, offset: number, endianness: Endianness) {
  return endianness === "LE" ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function isStandaloneJpegMarker(marker: number) {
  return marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7);
}

async function readFileStart(filePath: string, byteLimit: number) {
  const file = await open(filePath, "r");

  try {
    const stats = await file.stat();
    const bytesToRead = Math.min(stats.size, byteLimit);
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await file.read(buffer, 0, bytesToRead, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}
