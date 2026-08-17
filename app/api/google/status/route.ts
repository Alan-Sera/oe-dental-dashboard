import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { getGoogleConnectionStatus } from "@/lib/google-settings";

export const runtime = "nodejs";

export async function GET() {
  await requireSession();

  return NextResponse.json(await getGoogleConnectionStatus());
}
