import { requireSession } from "@/lib/auth";
import { getPatientFileSyncRuntime } from "@/lib/patient-file-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireSession();
  const sync = getPatientFileSyncRuntime();
  const patientId = new URL(request.url).searchParams.get("patientId");
  const status = sync.snapshot();
  const responseStatus = {
    ...status,
    startupPending: Boolean(process.env.APP_INTERNAL_SYNC_TOKEN) && !sync.isStarted(),
    ...(patientId ? { revision: sync.revisionForPatient(patientId) } : {})
  };
  return Response.json(responseStatus, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
