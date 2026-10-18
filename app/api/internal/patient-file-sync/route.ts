import { timingSafeEqual } from "node:crypto";

import { getPatientFileSyncRuntime } from "@/lib/patient-file-sync-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configured = process.env.APP_INTERNAL_SYNC_TOKEN;
  const received = request.headers.get("x-oe-file-sync-token") ?? "";
  if (!configured || !sameToken(configured, received)) {
    return new Response(null, { status: 404 });
  }

  getPatientFileSyncRuntime().start();
  return Response.json({ started: true }, { status: 202 });
}

function sameToken(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
