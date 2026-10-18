import { PatientsSearchFilterOnly } from "@/components/patients-search-filter-only";
import { ensureProfilePhotos } from "@/lib/actions/patient.actions";
import { listPatientDirectory } from "@/lib/patient-directory";
import { getPatientFileSyncRuntime } from "@/lib/patient-file-sync-runtime";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const initialFileSyncRevision = getPatientFileSyncRuntime().snapshot().revision;
  await ensureProfilePhotos();
  const patientItems = await listPatientDirectory();

  return (
    <main className="page-shell">
      <PatientsSearchFilterOnly patients={patientItems} initialFileSyncRevision={initialFileSyncRevision} />
    </main>
  );
}
