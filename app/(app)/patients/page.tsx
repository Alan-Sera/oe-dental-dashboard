import { PatientsSearchFilterOnly } from "@/components/patients-search-filter-only";
import { getPatients } from "@/lib/actions/patient.actions";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const patients = await getPatients();
  const patientItems = patients.map((patient) => ({
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    email: patient.email,
    updatedAt: patient.updatedAt.toISOString(),
    attachmentCount: patient.attachments.length
  }));

  return (
    <main className="page-shell">
      <PatientsSearchFilterOnly patients={patientItems} />
    </main>
  );
}
