import { NextResponse } from "next/server";

import { commitImportBatch } from "@/lib/actions/import.actions";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  await requireSession();

  const { batchId } = await params;
  const batch = await commitImportBatch(batchId);

  return NextResponse.json({ batch });
}
