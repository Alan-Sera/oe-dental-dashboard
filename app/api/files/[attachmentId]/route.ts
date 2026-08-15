import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { resolveVaultPath } from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  await requireSession();

  const { attachmentId } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId }
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const buffer = await readFile(resolveVaultPath(attachment.vaultPath));
  const encodedName = encodeURIComponent(attachment.originalName);

  return new Response(buffer, {
    headers: {
      "content-type": attachment.mimeType ?? "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodedName}`,
      "cache-control": "private, max-age=300"
    }
  });
}
