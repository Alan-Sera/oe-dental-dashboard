import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { createImportBatch } from "@/lib/actions/import.actions";
import { ensureDataDirectories } from "@/lib/local-paths";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await requireSession();
  await ensureDataDirectories();

  const body = await request.json();
  const batch = await createImportBatch(body);

  return NextResponse.json({ batch });
}
