"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpAZ, ArrowUpZA, BadgeDollarSign, CalendarDays, Search, X } from "lucide-react";

import { PatientCreateModal } from "@/components/patient-create-modal";
import { PatientAvatar } from "@/components/patient-avatar";
import { LoadingLink } from "@/components/loading-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  filterPatientDirectory,
  type PatientDirectoryRecord,
  type PatientAppointmentFilter,
  type PatientGenderFilter,
  type PatientSortOrder
} from "@/lib/patient-search";
import { cn, formatDate } from "@/lib/utils";
import { toDateKey } from "@/lib/date-utils";

export type PatientListItem = PatientDirectoryRecord & {
  id: string;
  email: string | null;
  nextAppointmentId: string | null;
  updatedAt: string;
  photoAttachmentId: string | null;
};

export function PatientsSearchFilterOnly({ patients }: { patients: PatientListItem[] }) {
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<PatientSortOrder>("asc");
  const [genderFilter, setGenderFilter] = useState<PatientGenderFilter>("ALL");
  const [appointmentFilter, setAppointmentFilter] = useState<PatientAppointmentFilter>("ALL");
  const [debtorsOnly, setDebtorsOnly] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState("");
  const filteredPatients = useMemo(
    () =>
      filterPatientDirectory(patients, {
        query,
        genderFilter,
        appointmentFilter,
        debtorsOnly,
        appointmentDate,
        sortOrder
      }),
    [appointmentDate, appointmentFilter, debtorsOnly, genderFilter, patients, query, sortOrder]
  );
  const hasQuery = query.trim().length > 0;
  const hasActiveFilters =
    genderFilter !== "ALL" || appointmentFilter !== "ALL" || debtorsOnly || appointmentDate.length > 0;
  const showResultCount = hasQuery || hasActiveFilters;
  const historySearchInputClass =
    "border-violet-400/70 bg-violet-100/90 placeholder:text-ink-500 focus:border-violet-500 focus:ring-violet-400/40 focus-visible:ring-violet-400/40 hover:border-violet-500/80 hover:bg-violet-200 dark:border-violet-400/60 dark:bg-violet-950/45 dark:placeholder:text-lavender-300 dark:focus:border-violet-300 dark:focus:ring-violet-300/40 dark:hover:border-violet-300 dark:hover:bg-violet-950/60";
  function resetFilters() {
    setGenderFilter("ALL");
    setAppointmentFilter("ALL");
    setDebtorsOnly(false);
    setAppointmentDate("");
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-theme-strong">Pacientes</h1>
          <p className="muted">{patients.length} expediente(s)</p>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lavender-200" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className={cn("h-10 rounded-full pl-10 pr-10 focus-visible:outline-none focus-visible:ring-2", historySearchInputClass)}
            aria-label="Buscar pacientes por nombre o teléfono"
          />
          {hasQuery ? (
            <Button
              type="button"
              variant="danger"
              size="icon"
              className="absolute right-3 top-1/2 size-7 -translate-y-1/2"
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant={sortOrder === "asc" ? "primary" : "ghost"}
                      size="sm"
                      className="rounded-none border-0"
                      onClick={() => setSortOrder("asc")}
                      aria-pressed={sortOrder === "asc"}
                    >
                      <ArrowUpAZ className="size-4" aria-hidden="true" />
                      A-Z
                    </Button>
                  }
                />
                <TooltipContent>Ordena pacientes por nombre de A a Z.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant={sortOrder === "desc" ? "primary" : "ghost"}
                      size="sm"
                      className="rounded-none border-0"
                      onClick={() => setSortOrder("desc")}
                      aria-pressed={sortOrder === "desc"}
                    >
                      <ArrowUpZA className="size-4" aria-hidden="true" />
                      Z-A
                    </Button>
                  }
                />
                <TooltipContent>Ordena pacientes por nombre de Z a A.</TooltipContent>
              </Tooltip>
            </div>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Select
                    value={genderFilter}
                    onChange={(event) => setGenderFilter(event.target.value as PatientGenderFilter)}
                    className="h-8 w-[120px]"
                    aria-label="Filtrar por género"
                  >
                    <option value="ALL">Todos</option>
                    <option value="MASCULINO">Masculino</option>
                    <option value="FEMENINO">Femenino</option>
                  </Select>
                }
              />
              <TooltipContent>Filtra pacientes por género.</TooltipContent>
            </Tooltip>

            <div
              role="group"
              aria-label="Filtrar pacientes por próxima cita"
              className="flex overflow-hidden rounded-md border border-lavender-600/55 bg-lavender-950/20"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant={appointmentFilter === "WITH_APPOINTMENT" ? "primary" : "ghost"}
                      size="sm"
                      className="rounded-none border-0"
                      onClick={() =>
                        setAppointmentFilter((current) =>
                          current === "WITH_APPOINTMENT" ? "ALL" : "WITH_APPOINTMENT"
                        )
                      }
                      aria-pressed={appointmentFilter === "WITH_APPOINTMENT"}
                    >
                      Con cita
                    </Button>
                  }
                />
                <TooltipContent>Mostrar solo pacientes con una próxima cita programada.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant={appointmentFilter === "WITHOUT_APPOINTMENT" ? "primary" : "ghost"}
                      size="sm"
                      className="rounded-none border-0"
                      onClick={() =>
                        setAppointmentFilter((current) =>
                          current === "WITHOUT_APPOINTMENT" ? "ALL" : "WITHOUT_APPOINTMENT"
                        )
                      }
                      aria-pressed={appointmentFilter === "WITHOUT_APPOINTMENT"}
                    >
                      Sin cita
                    </Button>
                  }
                />
                <TooltipContent>Mostrar solo pacientes sin próxima cita programada.</TooltipContent>
              </Tooltip>
            </div>

            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="group"
                    tabIndex={0}
                    aria-label="Filtro de deudores no disponible"
                    className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60"
                  >
                    <Button
                      type="button"
                      variant={debtorsOnly ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setDebtorsOnly((current) => !current)}
                      aria-pressed={debtorsOnly}
                      disabled
                    >
                      <BadgeDollarSign className="size-4" aria-hidden="true" />
                      Deudores
                    </Button>
                  </span>
                }
              />
              <TooltipContent>Filtro no disponible.</TooltipContent>
            </Tooltip>

            <div className="relative w-full sm:w-auto">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Input
                      type="date"
                      value={appointmentDate}
                      onChange={(event) => setAppointmentDate(event.target.value)}
                      className="h-8 w-full pl-9 sm:max-w-[173px] px-3"
                      aria-label="Filtrar por fecha de cita"
                    />
                  }
                />
                <TooltipContent>Filtrar por fecha de cita.</TooltipContent>
              </Tooltip>
            </div>

            {hasActiveFilters ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button type="button" variant="danger" size="sm" onClick={resetFilters}>
                      <X className="size-4" aria-hidden="true" />
                      Limpiar
                    </Button>
                  }
                />
                <TooltipContent>Quitar los filtros</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <div className="surface overflow-hidden">
          {filteredPatients.map((patient) => {
            const appointmentDateKey = patient.nextAppointmentDate
              ? toDateKey(new Date(patient.nextAppointmentDate))
              : null;
            const appointmentHref = appointmentDateKey
              ? `/agenda?view=day&date=${appointmentDateKey}${patient.nextAppointmentId ? `&cita=${encodeURIComponent(patient.nextAppointmentId)}` : ""}`
              : null;

            return (
              <div
                key={patient.id}
                className="grid gap-4 border-b border-lavender-600/45 px-4 py-4 transition last:border-0 hover:bg-lavender-800/20 md:grid-cols-[auto_1fr_auto]"
              >
                <LoadingLink
                  href={`/patients/${patient.id}`}
                  loadingLabel="Cargando expediente..."
                  className="flex min-w-0 items-center gap-4 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 md:col-span-2"
                >
                  <PatientAvatar
                    fullName={patient.fullName}
                    photoAttachmentId={patient.photoAttachmentId}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-medium text-theme-strong">{patient.fullName}</p>
                    <p className="truncate text-sm text-lavender-200/55">
                      {patient.phone ?? "Sin teléfono"} · {patient.email ?? "Sin correo"}
                    </p>
                  </div>
                </LoadingLink>
                <div className="flex flex-col items-start gap-2 text-sm text-lavender-200/65 md:items-end">
                  {appointmentHref ? (
                    <LoadingLink
                      href={appointmentHref}
                      loadingLabel="Abriendo próxima cita..."
                      aria-label={`Abrir próxima cita de ${patient.fullName}, ${formatDate(patient.nextAppointmentDate)}`}
                      className="group flex w-full min-w-[180px] items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-100/80 px-2.5 py-1.5 text-left text-sm text-emerald-950 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-200 dark:border-emerald-300/40 dark:bg-emerald-950/45 dark:text-emerald-100 dark:hover:border-emerald-300/65 dark:hover:bg-emerald-900/65 md:w-auto"
                    >
                      <CalendarDays className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-800/75 dark:text-emerald-200/70">Próxima cita</span>
                        <span className="block truncate text-xs font-semibold">{formatDate(patient.nextAppointmentDate)}</span>
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-emerald-700 transition-transform group-hover:translate-x-0.5 dark:text-emerald-300" aria-hidden="true" />
                    </LoadingLink>
                  ) : null}
                  {patient.balanceCents > 0 ? <p className="text-coral-400 dark:text-ink-100">Saldo pendiente</p> : null}
                  <p>{formatDate(patient.updatedAt)}</p>
                </div>
              </div>
            );
          })}
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
