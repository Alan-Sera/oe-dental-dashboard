"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpAZ, ArrowUpZA, BadgeDollarSign, CalendarDays, Search, X } from "lucide-react";

import { PatientCreateModal } from "@/components/patient-create-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  filterPatientDirectory,
  type PatientDirectoryRecord,
  type PatientGenderFilter,
  type PatientSortOrder
} from "@/lib/patient-search";
import { formatDate, initials } from "@/lib/utils";

export type PatientListItem = PatientDirectoryRecord & {
  id: string;
  email: string | null;
  updatedAt: string;
  attachmentCount: number;
};

export function PatientsSearchFilterOnly({ patients }: { patients: PatientListItem[] }) {
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<PatientSortOrder>("asc");
  const [genderFilter, setGenderFilter] = useState<PatientGenderFilter>("ALL");
  const [debtorsOnly, setDebtorsOnly] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState("");
  const filteredPatients = useMemo(
    () =>
      filterPatientDirectory(patients, {
        query,
        genderFilter,
        debtorsOnly,
        appointmentDate,
        sortOrder
      }),
    [appointmentDate, debtorsOnly, genderFilter, patients, query, sortOrder]
  );
  const hasQuery = query.trim().length > 0;
  const hasActiveFilters = genderFilter !== "ALL" || debtorsOnly || appointmentDate.length > 0;
  const showResultCount = hasQuery || hasActiveFilters;

  function resetFilters() {
    setGenderFilter("ALL");
    setDebtorsOnly(false);
    setAppointmentDate("");
  }

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
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="section-title">Expedientes</h2>
            {showResultCount ? (
              <p className="text-sm text-lavender-200/55">{filteredPatients.length} coincidencia(s)</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-lavender-600/55 bg-lavender-950/20">
              <Button
                type="button"
                variant={sortOrder === "asc" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none border-0"
                onClick={() => setSortOrder("asc")}
                aria-pressed={sortOrder === "asc"}
              >
                <ArrowUpAZ className="size-4" aria-hidden="true" />
                A-Z
              </Button>
              <Button
                type="button"
                variant={sortOrder === "desc" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none border-0"
                onClick={() => setSortOrder("desc")}
                aria-pressed={sortOrder === "desc"}
              >
                <ArrowUpZA className="size-4" aria-hidden="true" />
                Z-A
              </Button>
            </div>

            <Select
              value={genderFilter}
              onChange={(event) => setGenderFilter(event.target.value as PatientGenderFilter)}
              className="h-8 w-[150px]"
              aria-label="Filtrar por género"
            >
              <option value="ALL">Todos</option>
              <option value="MASCULINO">Masculino</option>
              <option value="FEMENINO">Femenino</option>
            </Select>

            <Button
              type="button"
              variant={debtorsOnly ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDebtorsOnly((current) => !current)}
              aria-pressed={debtorsOnly}
            >
              <BadgeDollarSign className="size-4" aria-hidden="true" />
              Deudores
            </Button>

            <div className="relative w-full sm:w-auto">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lavender-200/55" />
              <Input
                type="date"
                value={appointmentDate}
                onChange={(event) => setAppointmentDate(event.target.value)}
                className="h-8 w-full pl-9 sm:w-[165px]"
                aria-label="Filtrar por fecha de cita"
              />
            </div>

            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                <X className="size-4" aria-hidden="true" />
                Limpiar
              </Button>
            ) : null}
          </div>
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
                {patient.nextAppointmentDate ? <p>Cita {formatDateOnly(patient.nextAppointmentDate)}</p> : null}
                {patient.balanceCents > 0 ? <p className="text-coral-300">Saldo pendiente</p> : null}
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

function formatDateOnly(value: string) {
  return formatDate(`${value.slice(0, 10)}T12:00:00.000Z`);
}
