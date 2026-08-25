import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";

import { getClinicSettings } from "@/lib/actions/settings.actions";
import { requireSession } from "@/lib/auth";
import {
  canGenerateImagePreview,
  getImagePreviewCacheKey,
  parseImagePreviewWidth
} from "@/lib/image-preview";
import { getImagePreviewCacheDir, resolveLinkedAttachmentPath } from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PREVIEW_CACHE_CONTROL = "private, max-age=86400, stale-while-revalidate=604800";
const ORIGINAL_FALLBACK_CACHE_CONTROL = "private, max-age=300";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  await requireSession();

  const { attachmentId } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { patient: true }
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  if (!canGenerateImagePreview(attachment.originalName, attachment.mimeType)) {
    return NextResponse.json({ error: "Preview not available for this file" }, { status: 415 });
  }

  const settings = await getClinicSettings();
  let absolutePath: string;
  let fileStats;

  try {
    absolutePath = resolveLinkedAttachmentPath({
      patientsRootPath: settings.patientsRootPath,
      patientFolderRelativePath: attachment.patient.localFolderRelativePath,
      localRelativePath: attachment.localRelativePath
    });

    fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
      return NextResponse.json({ error: "Linked file not found" }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Linked file not found" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const width = parseImagePreviewWidth(searchParams.get("w"));
  const cacheKey = getImagePreviewCacheKey({
    attachmentId: attachment.id,
    absolutePath,
    fileSize: fileStats.size,
    modifiedTimeMs: fileStats.mtimeMs,
    width
  });
  const etag = `"${cacheKey}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: getPreviewHeaders(etag)
    });
  }

  const cacheDir = getImagePreviewCacheDir();
  const cachePath = path.join(cacheDir, `${cacheKey}.webp`);

  try {
    const cachedPreview = await readFile(cachePath);
    return imageResponse(cachedPreview, "image/webp", getPreviewHeaders(etag));
  } catch {
    // Cache misses are expected; generate below.
  }

  try {
    await mkdir(cacheDir, { recursive: true });
    const previewBuffer = await sharp(absolutePath, { failOn: "none" })
      .rotate()
      .resize({
        width,
        height: Math.round(width * 0.75),
        fit: "cover",
        withoutEnlargement: true
      })
      .webp({ quality: 74 })
      .toBuffer();

    await writeFile(cachePath, previewBuffer);

    return imageResponse(previewBuffer, "image/webp", getPreviewHeaders(etag));
  } catch {
    return originalImageFallbackResponse(absolutePath, attachment.mimeType);
  }
}

function getPreviewHeaders(etag: string) {
  return {
    "cache-control": PREVIEW_CACHE_CONTROL,
    "content-type": "image/webp",
    etag,
    vary: "Cookie"
  };
}

async function originalImageFallbackResponse(absolutePath: string, mimeType: string | null) {
  try {
    const buffer = await readFile(absolutePath);
    return imageResponse(buffer, mimeType ?? "application/octet-stream", {
      "cache-control": ORIGINAL_FALLBACK_CACHE_CONTROL,
      "content-type": mimeType ?? "application/octet-stream",
      vary: "Cookie"
    });
  } catch {
    return NextResponse.json({ error: "Linked file not found" }, { status: 404 });
  }
}

function imageResponse(buffer: Buffer, contentType: string, headers: HeadersInit) {
  const body = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      ...headers,
      "content-type": contentType
    }
  });
}
