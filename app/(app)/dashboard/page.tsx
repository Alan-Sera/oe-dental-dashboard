import Link from "next/link";
import { BadgeDollarSign, FileStack, FolderClock, UsersRound } from "lucide-react";

import { getRecentImportBatches } from "@/lib/actions/import.actions";
import { getPatients } from "@/lib/actions/patient.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { calculateLedgerTotals } from "@/lib/ledger";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [patients, batches, settings] = await Promise.all([
    getPatients(),
    getRecentImportBatches(),
    getClinicSettings()
  ]);

  const allCharges = patients.flatMap((patient) => patient.charges);
  const allPayments = patients.flatMap((patient) => patient.payments);
  const totals = calculateLedgerTotals(allCharges, allPayments);
  const attachmentCount = patients.reduce((total, patient) => total + patient.attachments.length, 0);
  const pendingBatches = batches.filter((batch) => batch.status === "PREVIEW").length;

  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="muted">{formatDate(new Date())}</p>
        </div>
        <Button asChild>
          <Link href="/import">Importar carpeta</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Pacientes" value={String(patients.length)} detail="Expedientes locales" icon={UsersRound} tone="mint" />
        <StatCard title="Saldo pendiente" value={formatCurrency(totals.balanceCents, settings.currency)} detail="Cargos menos pagos" icon={BadgeDollarSign} tone="amber" />
        <StatCard title="Archivos" value={String(attachmentCount)} detail="En bóveda local" icon={FileStack} tone="sky" />
        <StatCard title="Importaciones" value={String(pendingBatches)} detail="Lotes por revisar" icon={FolderClock} tone="coral" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Pacientes recientes</h2>
            <Link href="/patients" className="text-sm text-mint-500 hover:text-mint-400">
              Ver todos
            </Link>
          </div>
          <div className="surface overflow-hidden">
            {patients.slice(0, 8).map((patient) => {
              const patientTotals = calculateLedgerTotals(patient.charges, patient.payments);
              return (
                <Link
                  key={patient.id}
                  href={`/patients/${patient.id}`}
                  className="grid grid-cols-[1fr_auto] gap-3 border-b border-ink-700 px-4 py-3 transition last:border-0 hover:bg-ink-800"
                >
                  <div>
                    <p className="font-medium text-white">{patient.fullName}</p>
                    <p className="text-sm text-ink-500">
                      {patient.attachments.length} archivo(s) · {patient.clinicalEntries?.length ?? 0} nota(s)
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink-200">
                    {formatCurrency(patientTotals.balanceCents, settings.currency)}
                  </p>
                </Link>
              );
            })}
            {patients.length === 0 ? <p className="px-4 py-8 text-sm text-ink-500">Sin pacientes</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="section-title mb-4">Importaciones recientes</h2>
          <div className="space-y-3">
            {batches.map((batch) => (
              <div key={batch.id} className="surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink-100">{batch.sourceRootName}</p>
                  <Badge tone={batch.status === "COMMITTED" ? "mint" : batch.status === "FAILED" ? "coral" : "amber"}>
                    {batch.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  {batch.fileCount} archivo(s) · {formatDate(batch.createdAt)}
                </p>
              </div>
            ))}
            {batches.length === 0 ? <p className="text-sm text-ink-500">Sin importaciones</p> : null}
          </div>
        </Card>
      </section>
    </main>
  );
}
