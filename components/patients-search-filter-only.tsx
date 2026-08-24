"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { PatientCreateModal } from "@/components/patient-create-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { filterPatientsByQuery } from "@/lib/patient-search";
import { formatDate, initials } from "@/lib/utils";

export type PatientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  updatedAt: string;
  attachmentCount: number;
};

export function PatientsSearchFilterOnly({ patients }: { patients: PatientListItem[] }) {
  const [query, setQuery] = useState("");
  const filteredPatients = useMemo(() => filterPatientsByQuery(patients, query), [patients, query]);
  const hasQuery = query.trim().length > 0;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-white">Pacientes</h1>
          <p className="muted">{patients.length} expediente(s)</p>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lavender-200/55" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className="h-11 rounded-full pl-10 pr-10"
            aria-label="Buscar pacientes por nombre o teléfono"
          />
          {hasQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
              aria-label="Limpiar búsqueda"
              onClick={() => setQuery("")}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <PatientCreateModal />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="section-title">Expedientes</h2>
          {hasQuery ? (
            <p className="text-sm text-lavender-200/55">{filteredPatients.length} coincidencia(s)</p>
          ) : null}
        </div>
        <div className="surface overflow-hidden">
          {filteredPatients.map((patient) => (
            <Link
              key={patient.id}
              href={`/patients/${patient.id}`}
              className="grid gap-4 border-b border-lavender-600/45 px-4 py-4 transition last:border-0 hover:bg-lavender-800/30 md:grid-cols-[auto_1fr_auto]"
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
                <p>{patient.attachmentCount} archivo(s)</p>
                <p>{formatDate(patient.updatedAt)}</p>
              </div>
            </Link>
          ))}
          {filteredPatients.length === 0 ? (
            <p className="px-4 py-8 text-sm text-lavender-200/55">
              {hasQuery ? "Sin pacientes encontrados" : "Sin pacientes registrados"}
            </p>
          ) : null}
        </div>
      </Card>
    </>
  );
}
