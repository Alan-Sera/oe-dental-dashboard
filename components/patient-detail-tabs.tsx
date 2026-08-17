"use client";

import Image from "next/image";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import { BadgeDollarSign, FileText, FolderOpen, ImageIcon, NotebookPen } from "lucide-react";

import { categoryLabels } from "@/constants";
import type { SerializedAttachment, SerializedPatientDetail } from "@/types";
import { calculateLedgerTotals } from "@/lib/ledger";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ClinicalEntryForm } from "@/components/forms/clinical-entry-form";
import { PaymentForm, TreatmentChargeForm } from "@/components/forms/ledger-forms";
import { PatientForm } from "@/components/forms/patient-form";

export function PatientDetailTabs({ patient }: { patient: SerializedPatientDetail }) {
  const totals = calculateLedgerTotals(patient.charges, patient.payments);
  const currency = patient.charges[0]?.currency ?? patient.payments[0]?.currency ?? "MXN";
  const photos = patient.attachments.filter((attachment) =>
    ["PHOTO", "RADIOGRAPH"].includes(attachment.category)
  );

  return (
    <Tabs.Root defaultValue="summary" className="space-y-5">
      <Tabs.List className="flex gap-2 overflow-x-auto rounded-lg border border-lavender-600/55 bg-lavender-900/35 p-1">
        <Tab value="summary" icon={FileText} label="Resumen" />
        <Tab value="media" icon={ImageIcon} label="Fotos" />
        <Tab value="clinical" icon={NotebookPen} label="Historia" />
        <Tab value="ledger" icon={BadgeDollarSign} label="Cuenta" />
        <Tab value="files" icon={FolderOpen} label="Archivos" />
      </Tabs.List>

      <Tabs.Content value="summary" className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <h2 className="section-title mb-4">Datos del paciente</h2>
            <PatientForm
              patientId={patient.id}
              defaultValues={{
                fullName: patient.fullName,
                email: patient.email ?? "",
                phone: patient.phone ?? "",
                birthDate: patient.birthDate?.slice(0, 10) ?? "",
                notes: patient.notes ?? ""
              }}
            />
          </Card>
          <Card className="space-y-4">
            <h2 className="section-title">Estado de cuenta</h2>
            <div className="space-y-3">
              <Metric label="Cargos" value={formatCurrency(totals.chargeTotalCents, currency)} />
              <Metric label="Pagos" value={formatCurrency(totals.paymentTotalCents, currency)} />
              <Metric label="Saldo" value={formatCurrency(totals.balanceCents, currency)} strong />
            </div>
          </Card>
        </div>
      </Tabs.Content>

      <Tabs.Content value="media" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {photos.length > 0 ? (
          photos.map((attachment) => <AttachmentTile key={attachment.id} attachment={attachment} />)
        ) : (
          <EmptyState text="Sin fotos o radiografías importadas" />
        )}
      </Tabs.Content>

      <Tabs.Content value="clinical" className="space-y-5">
        <Card>
          <h2 className="section-title mb-4">Nueva nota clínica</h2>
          <ClinicalEntryForm patientId={patient.id} />
        </Card>
        <div className="space-y-3">
          {patient.clinicalEntries.length > 0 ? (
            patient.clinicalEntries.map((entry) => (
              <Card key={entry.id} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{formatDate(entry.entryDate)}</Badge>
                  {entry.tooth ? <Badge>Pieza {entry.tooth}</Badge> : null}
                  {entry.attachments.length ? <Badge tone="sky">{entry.attachments.length} archivo(s)</Badge> : null}
                </div>
                {entry.diagnosis ? <p className="text-sm text-ink-300">Diagnóstico: {entry.diagnosis}</p> : null}
                {entry.treatment ? <p className="text-sm text-ink-300">Tratamiento: {entry.treatment}</p> : null}
                <p className="whitespace-pre-wrap text-sm text-lavender-200/65">{entry.notes}</p>
              </Card>
            ))
          ) : (
            <EmptyState text="Sin notas clínicas registradas" />
          )}
        </div>
      </Tabs.Content>

      <Tabs.Content value="ledger" className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <h2 className="section-title mb-4">Agregar cargo</h2>
            <TreatmentChargeForm patientId={patient.id} />
          </Card>
          <Card>
            <h2 className="section-title mb-4">Registrar pago</h2>
            <PaymentForm patientId={patient.id} />
          </Card>
        </div>
        <Card>
          <h2 className="section-title mb-4">Movimientos</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <LedgerList
              title="Cargos"
              rows={patient.charges.map((charge) => ({
                id: charge.id,
                primary: charge.description,
                secondary: `${formatDate(charge.serviceDate)} · ${charge.status}`,
                amount: formatCurrency(charge.amountCents, charge.currency)
              }))}
            />
            <LedgerList
              title="Pagos"
              rows={patient.payments.map((payment) => ({
                id: payment.id,
                primary: payment.method,
                secondary: `${formatDate(payment.paidAt)} · ${payment.status}`,
                amount: formatCurrency(payment.amountCents, payment.currency)
              }))}
            />
          </div>
        </Card>
      </Tabs.Content>

      <Tabs.Content value="files" className="space-y-3">
        {patient.attachments.length > 0 ? (
          patient.attachments.map((attachment) => (
            <Card key={attachment.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink-100">{attachment.originalName}</p>
                <p className="text-sm text-lavender-200/55">{attachment.sourceRelativePath}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{categoryLabels[attachment.category]}</Badge>
                <Link href={`/api/files/${attachment.id}`} target="_blank" className="text-sm text-lavender-200 hover:text-white">
                  Abrir
                </Link>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState text="Sin archivos importados" />
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}

function Tab({
  value,
  label,
  icon: Icon
}: {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="flex h-10 items-center gap-2 rounded-md px-3 text-sm text-lavender-200/70 transition hover:bg-lavender-800/35 hover:text-lavender-50 data-[state=active]:bg-lavender-800/80 data-[state=active]:text-lavender-50"
    >
      <Icon className="size-4" />
      {label}
    </Tabs.Trigger>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-lavender-600/45 pb-3 last:border-0">
      <span className="text-sm text-lavender-200/70">{label}</span>
      <span className={strong ? "text-xl font-semibold text-white" : "font-medium text-ink-200"}>{value}</span>
    </div>
  );
}

function AttachmentTile({ attachment }: { attachment: SerializedAttachment }) {
  const isImage = attachment.mimeType?.startsWith("image/");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex aspect-[4/3] items-center justify-center bg-lavender-950/45">
        {isImage ? (
          <Image
            src={`/api/files/${attachment.id}`}
            alt={attachment.originalName}
            width={640}
            height={480}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <FileText className="size-12 text-lavender-500/55" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-2 p-4">
        <Badge tone={attachment.category === "RADIOGRAPH" ? "sky" : "neutral"}>
          {categoryLabels[attachment.category]}
        </Badge>
        <p className="truncate text-sm font-medium text-ink-100">{attachment.originalName}</p>
        <p className="text-xs text-lavender-200/55">{formatDate(attachment.importedAt)}</p>
      </div>
    </Card>
  );
}

function LedgerList({
  title,
  rows
}: {
  title: string;
  rows: Array<{ id: string; primary: string; secondary: string; amount: string }>;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-lavender-600/45 bg-lavender-950/25 px-4 py-3 text-sm font-medium text-lavender-100">{title}</div>
      {rows.length > 0 ? (
        rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 border-b border-lavender-600/45 px-4 py-3 transition last:border-0 hover:bg-lavender-800/25">
            <div>
              <p className="text-sm font-medium text-ink-100">{row.primary}</p>
              <p className="text-xs text-lavender-200/55">{row.secondary}</p>
            </div>
            <p className="text-sm font-semibold text-white">{row.amount}</p>
          </div>
        ))
      ) : (
        <p className="px-4 py-6 text-sm text-lavender-200/55">Sin movimientos</p>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="surface p-6 text-sm text-lavender-200/60">{text}</div>;
}
