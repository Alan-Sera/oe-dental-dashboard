import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";

import { getClinicSettings } from "@/lib/actions/settings.actions";
import { requireSession } from "@/lib/auth";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  const settings = await getClinicSettings();
  let absolutePath: string;

  try {
    absolutePath = resolveLinkedAttachmentPath({
      patientsRootPath: settings.patientsRootPath,
      patientFolderRelativePath: attachment.patient.localFolderRelativePath,
      localRelativePath: attachment.localRelativePath
    });
    const fileStats = await stat(absolutePath);

    if (!fileStats.isFile()) {
      return NextResponse.json({ error: "Linked file not found" }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Linked file not found" },
      { status: 404 }
    );
  }

  let buffer: Buffer;

  try {
    buffer = await readFile(absolutePath);
  } catch {
    return NextResponse.json({ error: "Linked file not found" }, { status: 404 });
  }

  const encodedName = encodeURIComponent(attachment.originalName);
  const body = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "content-type": attachment.mimeType ?? "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodedName}`,
      "cache-control": "private, max-age=300"
    }
  });
}
