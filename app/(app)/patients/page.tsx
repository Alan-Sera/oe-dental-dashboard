import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { PatientForm } from "@/components/forms/patient-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { getPatients } from "@/lib/actions/patient.actions";
import { calculateLedgerTotals } from "@/lib/ledger";
import { formatCurrency, formatDate, initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const [patients, settings] = await Promise.all([getPatients(), getClinicSettings()]);

  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Pacientes</h1>
          <p className="muted">{patients.length} expediente(s)</p>
        </div>
        <Badge tone="sky">
          <Search className="mr-2 size-3" aria-hidden="true" />
          Búsqueda visual
        </Badge>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Plus className="size-5 text-lavender-200" aria-hidden="true" />
          <h2 className="section-title">Nuevo paciente</h2>
        </div>
        <PatientForm />
      </Card>

      <Card>
        <h2 className="section-title mb-4">Expedientes</h2>
        <div className="surface overflow-hidden">
          {patients.map((patient) => {
            const totals = calculateLedgerTotals(patient.charges, patient.payments);
            return (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="grid gap-4 border-b border-lavender-600/45 px-4 py-4 transition last:border-0 hover:bg-lavender-800/30 md:grid-cols-[auto_1fr_auto_auto]"
              >
                <div className="flex size-11 items-center justify-center rounded-md bg-lavender-800/70 text-sm font-semibold text-lavender-100 ring-1 ring-lavender-300/30">
                  {initials(patient.fullName)}
                </div>
                <div>
                  <p className="font-medium text-white">{patient.fullName}</p>
                  <p className="text-sm text-lavender-200/55">
                    {patient.phone ?? "Sin teléfono"} · {patient.email ?? "Sin correo"}
                  </p>
                </div>
                <div className="text-sm text-lavender-200/65">
                  <p>{patient.attachments.length} archivo(s)</p>
                  <p>{formatDate(patient.updatedAt)}</p>
                </div>
                <p className="text-sm font-semibold text-white">
                  {formatCurrency(totals.balanceCents, settings.currency)}
                </p>
              </Link>
            );
          })}
          {patients.length === 0 ? <p className="px-4 py-8 text-sm text-lavender-200/55">Sin pacientes registrados</p> : null}
        </div>
      </Card>
    </main>
  );
}
