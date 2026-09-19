import { createHash } from "node:crypto";
import path from "node:path";

export const DEFAULT_IMAGE_PREVIEW_WIDTH = 520;
export const MIN_IMAGE_PREVIEW_WIDTH = 160;
export const MAX_IMAGE_PREVIEW_WIDTH = 1280;

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp"
]);

export function parseImagePreviewWidth(value: string | null) {
  const requestedWidth = Number(value ?? DEFAULT_IMAGE_PREVIEW_WIDTH);

  if (!Number.isFinite(requestedWidth)) {
    return DEFAULT_IMAGE_PREVIEW_WIDTH;
  }

  return Math.min(
    MAX_IMAGE_PREVIEW_WIDTH,
    Math.max(MIN_IMAGE_PREVIEW_WIDTH, Math.round(requestedWidth))
  );
}

export function canGenerateImagePreview(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";

  if (normalizedMimeType.startsWith("image/") && normalizedMimeType !== "image/svg+xml") {
    return true;
  }

  return PREVIEWABLE_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function getImagePreviewCacheKey({
  attachmentId,
  absolutePath,
  fileSize,
  modifiedTimeMs,
  width
}: {
  attachmentId: string;
  absolutePath: string;
  fileSize: number;
  modifiedTimeMs: number;
  width: number;
}) {
  return createHash("sha1")
    .update(`${attachmentId}|${absolutePath}|${fileSize}|${modifiedTimeMs}|${width}`)
    .digest("hex");
}
