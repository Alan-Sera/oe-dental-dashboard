import { PatientsSearchFilterOnly } from "@/components/patients-search-filter-only";
import { getPatients, ensureProfilePhotos } from "@/lib/actions/patient.actions";
import { calculateLedgerTotals } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  await ensureProfilePhotos();
  const patients = await getPatients();
  const patientItems = patients.map((patient) => {
    const totals = calculateLedgerTotals(patient.charges, patient.payments);

return {
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      email: patient.email,
      gender: patient.gender,
      nextAppointmentDate: patient.nextAppointmentDate?.toISOString() ?? null,
      balanceCents: totals.balanceCents,
      updatedAt: patient.updatedAt.toISOString(),
      photoAttachmentId: patient.profilePhotoId ?? null
    };
  });

  return (
    <main className="page-shell">
      <PatientsSearchFilterOnly patients={patientItems} />
    </main>
  );
}
