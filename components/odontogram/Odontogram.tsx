"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { ConfirmationDialog, confirmationCancelButtonClass } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import {
  useNavigationGuard,
  type BlockedNavigation,
  type NavigationBlocker,
} from "@/components/navigation-guard-provider";
import {
  PERMANENT_UPPER,
  PERMANENT_LOWER,
  PRIMARY_UPPER,
  PRIMARY_LOWER,
  SURFACE_LABELS,
  TREATMENTS,
  availableSurfaces,
  findDuplicateRecords,
  getTreatment,
  recordColor,
  recordIsValid,
  sameDentalRecordContent,
  upsertDentalRecord,
  type DentalRecord,
  type DentalRecordVersion,
  type PatientOdontogramData,
  type Phase,
  type SaveOdontogramResult,
  type Surface,
  type ToothNumber,
  type TreatmentCode,
  type TreatmentStatus,
} from "@/lib/odontogram";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToothSvg } from "./ToothSvg";

const EMPTY_RECORDS: DentalRecord[] = [];
const EMPTY_HISTORY: DentalRecordVersion[] = [];
type DentitionFilter = "both" | "permanent" | "primary";

export interface OdontogramProps {
  patientId: string;
  initialRecords?: DentalRecord[];
  initialRevision?: number;
  initialHistory?: DentalRecordVersion[];
  onSave?: (
    patientId: string,
    records: DentalRecord[],
    expectedRevision: number,
  ) => Promise<SaveOdontogramResult>;
  onRecordsChange?: (records: DentalRecord[]) => void;
}

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-lavender-500/55 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-400 dark:focus:border-lavender-300 dark:focus:ring-lavender-300/25";
const buttonClass = "rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:focus-visible:outline-lavender-300";
const STATUS_LABELS: Record<TreatmentStatus, string> = {
  pending: "No atendido", in_progress: "En proceso", completed: "Atendido",
};
const SURFACE_DISABLED_REASON = "Selecciona una pieza dental en el odontograma para habilitar sus superficies.";
const ADD_RECORD_DISABLED_REASON = "Selecciona una pieza dental para agregar el registro al odontograma.";

function ToothRow({
  teeth, records, selectedTooth, selectedSurfaces, onSelect, onSurfaceClick,
}: {
  teeth: readonly ToothNumber[];
  records: DentalRecord[];
  selectedTooth: ToothNumber | null;
  selectedSurfaces: Surface[];
  onSelect: (tooth: ToothNumber) => void;
  onSurfaceClick: (tooth: ToothNumber, surface: Surface) => void;
}) {
  const midpoint = teeth.length / 2;
  return (
    <div className="flex w-max items-center justify-center gap-0.5">
      {teeth.map((tooth, index) => (
        <div key={tooth} className={index === midpoint ? "ml-3 border-l border-dashed border-rose-300 pl-3" : ""}>
          <ToothSvg
            tooth={tooth}
            records={records.filter((record) => record.tooth === tooth)}
            selected={selectedTooth === tooth}
            selectedSurfaces={selectedTooth === tooth ? selectedSurfaces : []}
            onSelect={() => onSelect(tooth)}
            onSurfaceClick={(surface) => onSurfaceClick(tooth, surface)}
          />
        </div>
      ))}
    </div>
  );
}

function countUnsavedRecordChanges(records: DentalRecord[], persistedRecords: DentalRecord[]) {
  const currentById = new Map(records.map((record) => [record.id, record]));
  const persistedById = new Map(persistedRecords.map((record) => [record.id, record]));
  const recordIds = new Set([...currentById.keys(), ...persistedById.keys()]);

  let changes = 0;
  for (const id of recordIds) {
    const current = currentById.get(id);
    const persisted = persistedById.get(id);
    if (!current || !persisted || !sameDentalRecordContent(current, persisted)) changes += 1;
  }
  return changes;
}

export default function Odontogram({
  patientId,
  initialRecords = EMPTY_RECORDS,
  initialRevision = 0,
  initialHistory = EMPTY_HISTORY,
  onSave,
  onRecordsChange,
}: OdontogramProps) {
  const [records, setRecords] = useState<DentalRecord[]>(initialRecords);
  const recordsRef = useRef<DentalRecord[]>(initialRecords);
  const persistedRecordsRef = useRef<DentalRecord[]>(initialRecords);
  const [revision, setRevision] = useState(initialRevision);
  const [history, setHistory] = useState<DentalRecordVersion[]>(initialHistory);
  const [conflictSnapshot, setConflictSnapshot] = useState<PatientOdontogramData | null>(null);
  const [selectedTooth, setSelectedTooth] = useState<ToothNumber | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<Surface[]>([]);
  const [treatment, setTreatment] = useState<TreatmentCode>("resin");
  const [phase, setPhase] = useState<Phase>("current");
  const [status, setStatus] = useState<TreatmentStatus>("pending");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<DentitionFilter>("both");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DentalRecord | null>(null);
  const [recordPendingDelete, setRecordPendingDelete] = useState<DentalRecord | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [draftStarted, setDraftStarted] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<BlockedNavigation | null>(null);
  const [navigationSaveError, setNavigationSaveError] = useState<string | null>(null);
  const [navigationDuplicateMatches, setNavigationDuplicateMatches] = useState<DentalRecord[] | null>(null);
  const [navigationSaving, setNavigationSaving] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const { registerBlocker } = useNavigationGuard();
  const formSectionRef = useRef<HTMLElement | null>(null);
  const formTitleRef = useRef<HTMLHeadingElement | null>(null);
  const saveInExpedienteButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const onBlockedNavigationRef = useRef<(request: BlockedNavigation) => void>(() => undefined);
  const navigationBlockerRef = useRef<NavigationBlocker | null>(null);

  const selectedTreatment = getTreatment(treatment);
  const currentEditingRecord = editingRecordId
    ? records.find((record) => record.id === editingRecordId)
    : undefined;
  const editDraft = currentEditingRecord && selectedTooth
    ? {
      ...currentEditingRecord,
      tooth: selectedTooth,
      treatment,
      surfaces: selectedTreatment.scope === "surface" ? selectedSurfaces : [],
      phase,
      status,
      notes: notes.trim(),
    }
    : null;
  const hasEditChanges = Boolean(
    currentEditingRecord && editDraft && !sameDentalRecordContent(currentEditingRecord, editDraft),
  );
  const addRecordDisabled = !selectedTooth || Boolean(currentEditingRecord && !hasEditChanges);
  const addRecordDisabledReason = !selectedTooth
    ? ADD_RECORD_DISABLED_REASON
    : currentEditingRecord && !hasEditChanges
      ? "Modifica al menos un dato del registro para habilitar Guardar cambios."
      : null;
  const listed = useMemo(() => [...records].reverse(), [records]);
  const toothRecords = selectedTooth ? records.filter((record) => record.tooth === selectedTooth) : [];
  const duplicateMatches = duplicateCandidate
    ? findDuplicateRecords(records, duplicateCandidate, duplicateCandidate.id)
    : [];
  const hasFormDraft = draftStarted || editingRecordId !== null;
  const hasUnsavedChanges = dirty || hasFormDraft;
  const unsavedRecordCount = countUnsavedRecordChanges(records, persistedRecordsRef.current);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  onBlockedNavigationRef.current = (request) => {
    setPendingNavigation(request);
    setNavigationSaveError(null);
    setNavigationDuplicateMatches(null);
  };
  if (!navigationBlockerRef.current) {
    navigationBlockerRef.current = {
      hasUnsavedChanges: () => hasUnsavedChangesRef.current,
      onNavigationBlocked: (request) => onBlockedNavigationRef.current(request),
    };
  }

  useEffect(() => {
    if (!onSave || !navigationBlockerRef.current) return;
    return registerBlocker(navigationBlockerRef.current);
  }, [onSave, registerBlocker]);
  const saveRecordButton = (
    <button type="button" onClick={addRecord} disabled={addRecordDisabled}
      className="w-full flex-1 rounded-lg bg-blue-600 px-4 py-3 text-md font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-brand-400 dark:text-ink-950 dark:hover:bg-brand-300 dark:disabled:bg-ink-700 dark:disabled:text-ink-300">
      {editingRecordId ? "Guardar cambios" : "+ Agregar al odontograma"}
    </button>
  );
  const saveRecordButtonControl = addRecordDisabledReason ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span tabIndex={0} aria-label={addRecordDisabledReason}
            className="block w-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:focus-visible:outline-lavender-300">
            {saveRecordButton}
          </span>
        }
      />
      <TooltipContent className="text-center">{addRecordDisabledReason}</TooltipContent>
    </Tooltip>
  ) : saveRecordButton;
  const addRecordButton = (
    <div className={editingRecordId ? "flex flex-col gap-2 sm:flex-row" : ""}>
      {saveRecordButtonControl}
      {editingRecordId ? (
        <button type="button" onClick={cancelEditing}
          className={`${buttonClass} inline-flex w-full flex-1 items-center justify-center whitespace-nowrap border-coral-500 bg-coral-500 text-white hover:border-red-700 hover:bg-red-700 dark:hover:border-coral-400 dark:hover:bg-coral-400 sm:w-auto sm:flex-none`}>
          Cancelar edición
        </button>
      ) : null}
    </div>
  );

  function updateRecords(next: DentalRecord[]) {
    recordsRef.current = next;
    setRecords(next);
    setDuplicateCandidate(null);
    setDirty(true);
    setNotice(null);
    onRecordsChange?.(next);
  }

  function chooseTooth(tooth: ToothNumber) {
    setDraftStarted(true);
    setSelectedTooth(tooth);
    setSelectedSurfaces([]);
    setDuplicateCandidate(null);
    setNotice(null);
  }

  function clickSurface(tooth: ToothNumber, surface: Surface) {
    setDraftStarted(true);
    setDuplicateCandidate(null);
    if (selectedTooth !== tooth) {
      setSelectedTooth(tooth);
      setSelectedSurfaces([surface]);
    } else {
      setSelectedSurfaces((items) => items.includes(surface) ? items.filter((s) => s !== surface) : [...items, surface]);
    }
    setNotice(null);
  }

  function startEditing(record: DentalRecord) {
    const cancelledAnotherDraft = editingRecordId !== null && editingRecordId !== record.id;
    setEditingRecordId(record.id);
    setDraftStarted(true);
    setSelectedTooth(record.tooth);
    setSelectedSurfaces([...record.surfaces]);
    setTreatment(record.treatment);
    setPhase(record.phase);
    setStatus(record.status);
    setNotes(record.notes);
    setDuplicateCandidate(null);
    setNotice(cancelledAnotherDraft
      ? "La edición anterior se canceló; el registro guardado permanece intacto."
      : null);

    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      formTitleRef.current?.focus({ preventScroll: true });
    });
  }

  function cancelEditing() {
    setEditingRecordId(null);
    setDraftStarted(false);
    setSelectedTooth(null);
    setSelectedSurfaces([]);
    setTreatment("resin");
    setPhase("current");
    setStatus("pending");
    setNotes("");
    setDuplicateCandidate(null);
    setNotice("Se canceló la edición; el registro original no se modificó.");
  }

  function addRecord() {
    const { entry, error } = buildFormRecord();
    if (!entry) {
      setNotice(error ?? "Completa los datos del registro clínico.");
      return;
    }
    const editingRecord = editingRecordId
      ? records.find((record) => record.id === editingRecordId)
      : undefined;
    if (editingRecordId && !editingRecord) {
      cancelEditing();
      setNotice("El registro ya no está disponible para editar.");
      return;
    }

    if (findDuplicateRecords(records, entry, editingRecord?.id).length > 0) {
      setDuplicateCandidate(entry);
      setNotice(null);
      return;
    }

    commitRecord(entry);
  }

  function buildFormRecord(): { entry?: DentalRecord; error?: string } {
    if (!selectedTooth) return { error: "Selecciona una pieza dental antes de guardar el registro." };
    if (selectedTreatment.scope === "surface" && selectedSurfaces.length === 0) {
      return { error: "Selecciona al menos una superficie dental para este tratamiento." };
    }

    const editingRecord = editingRecordId
      ? records.find((record) => record.id === editingRecordId)
      : undefined;
    if (editingRecordId && !editingRecord) {
      return { error: "El registro que intentas editar ya no está disponible." };
    }

    const entry: DentalRecord = {
      id: editingRecord?.id ?? crypto.randomUUID(),
      tooth: selectedTooth,
      treatment,
      surfaces: selectedTreatment.scope === "surface" ? selectedSurfaces : [],
      phase,
      status,
      notes: notes.trim(),
      createdAt: editingRecord?.createdAt ?? new Date().toISOString(),
    };

    return recordIsValid(entry)
      ? { entry }
      : { error: "Revisa la pieza, el tratamiento y sus superficies antes de guardar." };
  }

  function commitRecord(entry: DentalRecord) {
    const isEditing = records.some((record) => record.id === entry.id);
    updateRecords(upsertDentalRecord(records, entry));
    setEditingRecordId(null);
    setDraftStarted(false);
    setSelectedSurfaces([]);
    setNotes("");
    setNotice(isEditing
      ? `Se actualizaron los cambios de ${getTreatment(entry.treatment).label.toLowerCase()} en la pieza ${entry.tooth}.`
      : `Se agregó ${getTreatment(entry.treatment).label.toLowerCase()} en la pieza ${entry.tooth}.`);
  }

  function changeRecordStatus(id: string, nextStatus: TreatmentStatus) {
    updateRecords(records.map((record) => record.id === id ? { ...record, status: nextStatus } : record));
  }

  function deleteRecord(id: string) {
    updateRecords(records.filter((record) => record.id !== id));
    if (editingRecordId === id) {
      setEditingRecordId(null);
      setDraftStarted(false);
      setSelectedTooth(null);
      setSelectedSurfaces([]);
      setNotice("El registro se eliminó y su edición quedó cancelada.");
    }
  }

  function confirmDeleteRecord() {
    if (!recordPendingDelete) return;
    deleteRecord(recordPendingDelete.id);
    setRecordPendingDelete(null);
  }

  async function save() {
    if (!onSave || !dirty || saving) return;
    setSaving(true);
    setNotice(null);
    const snapshot = records;
    try {
      const result = await onSave(patientId, snapshot, revision);
      if (!result.success) {
        if (result.latest) setConflictSnapshot(result.latest);
        setNotice(result.error);
        return;
      }

      const { data } = result;
      const changedWhileSaving = recordsRef.current !== snapshot;
      const persistedById = new Map(data.records.map((record) => [record.id, record]));
      const reconciledRecords = recordsRef.current.map((record) => {
        const persistedRecord = persistedById.get(record.id);
        return persistedRecord
          ? { ...record, createdAt: persistedRecord.createdAt }
          : record;
      });

      recordsRef.current = reconciledRecords;
      persistedRecordsRef.current = data.records;
      setRecords(reconciledRecords);
      onRecordsChange?.(reconciledRecords);
      setRevision(data.revision);
      setHistory(data.history);
      setConflictSnapshot(null);

      if (!changedWhileSaving) {
        setDirty(false);
        setNotice("Odontograma guardado correctamente.");
      } else {
        setNotice("Se guardó una versión, pero hay cambios nuevos pendientes.");
      }
    } catch (error) {
      setNotice(error instanceof Error
        ? error.message
        : "No se guardó. El borrador sigue disponible; inténtalo nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  function resetFormDraft() {
    setEditingRecordId(null);
    setDraftStarted(false);
    setSelectedTooth(null);
    setSelectedSurfaces([]);
    setTreatment("resin");
    setPhase("current");
    setStatus("pending");
    setNotes("");
    setDuplicateCandidate(null);
  }

  function stayOnOdontogram() {
    pendingNavigation?.cancel();
    setPendingNavigation(null);
    setNavigationSaveError(null);
    setNavigationDuplicateMatches(null);

    window.requestAnimationFrame(() => {
      saveInExpedienteButtonRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    });
  }

  function discardPendingAndContinue() {
    if (!pendingNavigation || navigationSaving) return;

    restorePersistedSnapshot();

    const navigation = pendingNavigation;
    setPendingNavigation(null);
    navigation.resume();
  }

  function restorePersistedSnapshot() {
    const persistedSnapshot = conflictSnapshot ?? {
      revision,
      records: persistedRecordsRef.current,
      history,
    };
    recordsRef.current = persistedSnapshot.records;
    persistedRecordsRef.current = persistedSnapshot.records;
    setRecords(persistedSnapshot.records);
    setRevision(persistedSnapshot.revision);
    setHistory(persistedSnapshot.history);
    onRecordsChange?.(persistedSnapshot.records);
    setDirty(false);
    hasUnsavedChangesRef.current = false;
    setConflictSnapshot(null);
    resetFormDraft();
    setNavigationSaveError(null);
    setNavigationDuplicateMatches(null);
  }

  function discardChanges() {
    if (saving || navigationSaving || !hasUnsavedChanges) return;

    restorePersistedSnapshot();
    setDiscardConfirmationOpen(false);
    setNotice("Se descartaron los cambios; se restauró la última versión guardada.");
  }

  async function savePendingAndContinue(allowDuplicate = false) {
    if (!pendingNavigation || !onSave || navigationSaving || saving) return;
    if (conflictSnapshot) {
      setNavigationSaveError("Resuelve el conflicto con la versión guardada antes de volver a intentar.");
      return;
    }

    setNavigationSaveError(null);
    setNavigationDuplicateMatches(null);

    let snapshot = records;
    if (hasFormDraft) {
      const { entry, error } = buildFormRecord();
      if (!entry) {
        setNavigationSaveError(error ?? "Completa los datos del registro antes de guardar.");
        return;
      }

      const editingRecord = editingRecordId
        ? records.find((record) => record.id === editingRecordId)
        : undefined;
      const matches = findDuplicateRecords(records, entry, editingRecord?.id);
      if (matches.length > 0 && !allowDuplicate) {
        setNavigationDuplicateMatches(matches);
        return;
      }

      snapshot = upsertDentalRecord(records, entry);
    }

    setNavigationSaving(true);
    try {
      const result = await onSave(patientId, snapshot, revision);
      if (!result.success) {
        if (result.latest) setConflictSnapshot(result.latest);
        setNavigationSaveError(result.error);
        return;
      }

      const { data } = result;
      recordsRef.current = data.records;
      persistedRecordsRef.current = data.records;
      setRecords(data.records);
      onRecordsChange?.(data.records);
      setRevision(data.revision);
      setHistory(data.history);
      setConflictSnapshot(null);
      setDirty(false);
      hasUnsavedChangesRef.current = false;
      resetFormDraft();
      setNotice(null);
      setNavigationSaveError(null);
      setNavigationDuplicateMatches(null);

      const navigation = pendingNavigation;
      setPendingNavigation(null);
      navigation.resume();
    } catch (error) {
      setNavigationSaveError(error instanceof Error
        ? error.message
        : "No se guardó. Los cambios siguen disponibles; inténtalo nuevamente.");
    } finally {
      setNavigationSaving(false);
    }
  }

  function loadConflictSnapshot() {
    if (!conflictSnapshot) return;

    const nextRecords = conflictSnapshot.records;
    recordsRef.current = nextRecords;
    persistedRecordsRef.current = nextRecords;
    setRecords(nextRecords);
    setRevision(conflictSnapshot.revision);
    setHistory(conflictSnapshot.history);
    setConflictSnapshot(null);
    setEditingRecordId(null);
    setSelectedTooth(null);
    setSelectedSurfaces([]);
    setTreatment("resin");
    setPhase("current");
    setStatus("pending");
    setNotes("");
    setDuplicateCandidate(null);
    setDraftStarted(false);
    setDirty(false);
    onRecordsChange?.(nextRecords);
    setNotice("Se cargó la versión guardada; el borrador anterior se descartó.");
  }

  function formatHistoryDate(value: string) {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <div className="odontogram-theme grid gap-5 font-sans text-slate-900 dark:text-ink-100">
      {!onSave ? (
        <div
          className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-300/25 dark:bg-amber-950/35 dark:text-amber-100"
          role="note"
        >
          <strong>Prototipo sin guardado.</strong> Los cambios solo permanecen
          mientras este expediente está abierto; se perderán al salir o recargar.
        </div>
      ) : null}
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-lavender-500/40 dark:bg-lavender-950">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-skyline-400/40 dark:bg-skyline-900/55" role="note" >
          <div className="flex items-center gap-1" role="note" >
            <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">i</span>
            <p className="text-sm tracking-tight text-blue-950 dark:text-ink-100">
              <strong>Cómo seleccionar:</strong> Haz clic en la numeración del diente para seleccionarlo completo o en sus superficies para marcarlas.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-sm font-medium text-slate-600 dark:text-lavender-200">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-blue-600" />Anterior / existente</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-600" />Actual / por tratar</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-amber-600 bg-amber-100 dark:border-amber-400 dark:bg-amber-900" />Seleccionado</span>
          </div>
        </div >

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-2">
          <span className="text-md font-semibold uppercase tracking-wider text-slate-500">Vista de dentición</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-lavender-500/45 dark:bg-ink-900">
            {([
              ["both", "Ambas"], ["permanent", "Permanente"], ["primary", "Temporal"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className={`rounded-md px-3 py-1.5 text-md font-semibold transition ${filter === id ? "bg-brand-600 text-white shadow-sm dark:bg-brand-400 dark:text-ink-950" : "text-slate-500 hover:text-slate-800 dark:text-lavender-200 dark:hover:text-ink-100"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto px-4 pb-7 pt-4">
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-3">
            {filter !== "primary" && (
              <div className="flex flex-col items-center gap-1">
                <p className="text-md font-semibold text-slate-500">Arcada superior · Permanente</p>
                <ToothRow teeth={PERMANENT_UPPER} records={records} selectedTooth={selectedTooth}
                  selectedSurfaces={selectedSurfaces} onSelect={chooseTooth} onSurfaceClick={clickSurface} />
              </div>
            )}
            {filter === "both" && <div className="h-px w-[65%] border-t border-dashed border-slate-200 dark:border-lavender-500/45" />}
            {filter !== "permanent" && (
              <div className="flex flex-col items-center gap-1">
                <p className="text-md font-semibold text-slate-500">Arcada superior · Temporal</p>
                <ToothRow teeth={PRIMARY_UPPER} records={records} selectedTooth={selectedTooth}
                  selectedSurfaces={selectedSurfaces} onSelect={chooseTooth} onSurfaceClick={clickSurface} />
              </div>
            )}
            <div className="w-full max-w-[830px] border-t border-dashed border-rose-200 dark:border-coral-500/45" />
            {filter !== "permanent" && (
              <div className="flex flex-col items-center gap-1">
                <ToothRow teeth={PRIMARY_LOWER} records={records} selectedTooth={selectedTooth}
                  selectedSurfaces={selectedSurfaces} onSelect={chooseTooth} onSurfaceClick={clickSurface} />
                <p className="text-md font-semibold text-slate-500">Arcada inferior · Temporal</p>
              </div>
            )}
            {filter === "both" && <div className="h-px w-[65%] border-t border-dashed border-slate-200 dark:border-lavender-500/45" />}
            {filter !== "primary" && (
              <div className="flex flex-col items-center gap-1">
                <ToothRow teeth={PERMANENT_LOWER} records={records} selectedTooth={selectedTooth}
                  selectedSurfaces={selectedSurfaces} onSelect={chooseTooth} onSurfaceClick={clickSurface} />
                <p className="text-md font-semibold text-slate-500">Arcada inferior · Permanente</p>
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-md text-slate-500 dark:border-lavender-500/35 dark:bg-ink-900 dark:text-lavender-200">
          {selectedTooth ? (
            <>Pieza seleccionada: <strong className="text-slate-800">{selectedTooth[0]}.{selectedTooth[1]}</strong> · {toothRecords.length} registro(s) · {selectedSurfaces.length ? `Superficies: ${selectedSurfaces.join(", ")}` : "Sin superficies marcadas"}</>
          ) : "Ninguna pieza seleccionada todavía."}
        </div>
      </section >

      <section ref={formSectionRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-lavender-500/40 dark:bg-lavender-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 ref={formTitleRef} tabIndex={-1} className="text-lg font-bold focus-visible:outline-none">{editingRecordId ? "Editar registro clínico" : "Nuevo registro clínico"}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-lavender-200">{selectedTooth ? `Pieza ${selectedTooth[0]}.${selectedTooth[1]}` : "Selecciona una pieza en el odontograma"}</p>
          </div>
          <div className="w-80">
            {addRecordButton}
          </div>
        </div>
        {pendingNavigation ? (
          <ConfirmationDialog
            open
            onOpenChange={(open) => {
              if (!open) stayOnOdontogram();
            }}
            tone="primary"
            title={navigationDuplicateMatches ? "Confirma el tratamiento repetido" : "Hay cambios sin guardar"}
            description={navigationDuplicateMatches
              ? "Ya hay registros similares. Puedes guardar este registro separado de todos modos o quedarte para revisarlo."
              : "Antes de salir del odontograma, guarda los cambios en el expediente o descártalos."}
            itemLabel={hasFormDraft
              ? selectedTooth
                ? `Pieza ${selectedTooth[0]}.${selectedTooth[1]} · ${selectedTreatment.label}`
                : "Registro clínico sin pieza seleccionada"
              : "Cambios en tratamientos asignados"}
            icon={<AlertTriangle className="size-5 text-amber-400" aria-hidden="true" />}
            closeLabel="Seguir aquí"
            closeDisabled={navigationSaving}
            size="medium"
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className={`w-full sm:w-auto ${confirmationCancelButtonClass}`}
                  disabled={navigationSaving}
                  onClick={stayOnOdontogram}
                >
                  Seguir aquí
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="w-full hover:bg-red-700 dark:hover:bg-coral-400 sm:w-auto"
                  disabled={navigationSaving}
                  onClick={discardPendingAndContinue}
                >
                  Descartar y continuar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:w-auto"
                  disabled={navigationSaving || saving || conflictSnapshot !== null}
                  onClick={() => savePendingAndContinue(navigationDuplicateMatches !== null)}
                >
                  {navigationSaving
                    ? "Guardando…"
                    : conflictSnapshot
                      ? "Resuelve el conflicto primero"
                      : navigationDuplicateMatches
                        ? "Agregar y guardar de todos modos"
                        : "Guardar y continuar"}
                </Button>
              </>
            }
          >
            <div className="space-y-3 overflow-y-auto border-b border-lavender-500/25 px-5 py-4 text-sm text-theme-strong">
              {hasFormDraft ? (
                <section className="rounded-lg border border-lavender-500/25 bg-lavender-900/20 p-3">
                  <h4 className="font-semibold">{editingRecordId ? "Edición pendiente" : "Registro por agregar"}</h4>
                  <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                    <div><dt className="inline text-lavender-200/70">Pieza: </dt><dd className="inline">{selectedTooth ? `${selectedTooth[0]}.${selectedTooth[1]}` : "Sin seleccionar"}</dd></div>
                    <div><dt className="inline text-lavender-200/70">Tratamiento: </dt><dd className="inline">{selectedTreatment.label}</dd></div>
                    <div><dt className="inline text-lavender-200/70">Registro: </dt><dd className="inline">{phase === "previous" ? "Existente" : "Actual"}</dd></div>
                    <div><dt className="inline text-lavender-200/70">Superficies: </dt><dd className="inline">{selectedTreatment.scope === "whole" ? "Pieza completa" : selectedSurfaces.length > 0 ? selectedSurfaces.map((surface) => `${surface} (${SURFACE_LABELS[surface]})`).join(", ") : "Ninguna seleccionada"}</dd></div>
                    <div><dt className="inline text-lavender-200/70">Estado: </dt><dd className="inline">{STATUS_LABELS[status]}</dd></div>
                    <div className="sm:col-span-2"><dt className="inline text-lavender-200/70">Observaciones: </dt><dd className="inline break-words">{notes.trim() || "Sin observaciones"}</dd></div>
                  </dl>
                </section>
              ) : null}

              {dirty ? (
                <section className="rounded-lg border border-amber-300/25 bg-amber-950/20 p-3 text-xs text-amber-100">
                  <p className="font-semibold">Cambios en tratamientos asignados</p>
                  <p className="mt-1">{unsavedRecordCount > 0
                    ? `${unsavedRecordCount} registro(s) agregado(s), editado(s) o retirado(s) aún no persistidos.`
                    : "Hay cambios locales en el listado que todavía no se han guardado en el expediente."}</p>
                </section>
              ) : null}

              {navigationDuplicateMatches ? (
                <section className="rounded-lg border border-amber-300/35 bg-amber-950/25 p-3 text-xs text-amber-100" role="alert">
                  <p className="font-semibold">Registros similares encontrados</p>
                  <ul className="mt-2 space-y-1.5">
                    {navigationDuplicateMatches.map((record) => (
                      <li key={record.id}>
                        Pieza {record.tooth[0]}.{record.tooth[1]} · {getTreatment(record.treatment).label} · {record.phase === "previous" ? "Existente" : "Actual"} · {record.surfaces.length > 0 ? record.surfaces.join(" / ") : "pieza completa"}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">Si confirmas, se guardará como un registro separado.</p>
                </section>
              ) : null}

              {navigationSaveError ? (
                <p role="alert" className="rounded-lg border border-red-400/40 bg-red-950/25 px-3 py-2 text-xs text-red-100">
                  {navigationSaveError}
                </p>
              ) : null}
            </div>
          </ConfirmationDialog>
        ) : null}
        {discardConfirmationOpen ? (
          <ConfirmationDialog
            open
            onOpenChange={setDiscardConfirmationOpen}
            tone="danger"
            title="¿Cancelar los cambios sin guardar?"
            description="Se descartarán los cambios locales y se recuperará la última versión guardada en el expediente."
            itemLabel={hasFormDraft && selectedTooth
              ? `Pieza ${selectedTooth[0]}.${selectedTooth[1]} · ${selectedTreatment.label}`
              : "Cambios locales del odontograma"}
            icon={<AlertTriangle className="size-5 text-red-600" aria-hidden="true" />}
            closeLabel="Seguir editando"
            closeDisabled={saving || navigationSaving}
            size="medium"
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className={`w-full sm:w-auto ${confirmationCancelButtonClass}`}
                  disabled={saving || navigationSaving}
                  onClick={() => setDiscardConfirmationOpen(false)}
                >
                  Seguir editando
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="w-full hover:bg-red-700 dark:hover:bg-coral-400 sm:w-auto"
                  disabled={saving || navigationSaving}
                  onClick={discardChanges}
                >
                  Descartar cambios
                </Button>
              </>
            }
          >
            <div className="space-y-2 border-b border-lavender-500/25 px-5 py-4 text-sm text-theme-strong">
              {hasFormDraft ? (
                <section className="rounded-lg border border-red-300/25 bg-red-950/10 p-3">
                  <p className="font-semibold">Registro o edición pendiente</p>
                  <p className="mt-1 text-xs">
                    {selectedTooth ? `Pieza ${selectedTooth[0]}.${selectedTooth[1]}` : "Sin pieza seleccionada"} · {selectedTreatment.label} · {phase === "previous" ? "Existente" : "Actual"}
                  </p>
                  <p className="mt-1 text-xs">
                    Superficies: {selectedTreatment.scope === "whole" ? "pieza completa" : selectedSurfaces.length > 0 ? selectedSurfaces.join(" / ") : "ninguna seleccionada"} · Estado: {STATUS_LABELS[status]}
                  </p>
                  {notes.trim() ? <p className="mt-1 break-words text-xs">Observaciones: {notes.trim()}</p> : null}
                </section>
              ) : null}
              {dirty ? (
                <p className="rounded-lg border border-red-300/25 bg-red-950/10 p-3 text-xs">
                  También se descartarán los cambios en tratamientos asignados que aún no se hayan guardado ({unsavedRecordCount} registro(s) afectado(s)).
                </p>
              ) : null}
            </div>
          </ConfirmationDialog>
        ) : null}
        {duplicateCandidate ? (
          <ConfirmationDialog
            open
            onOpenChange={(open) => {
              if (!open) setDuplicateCandidate(null);
            }}
            tone="danger"
            title="Se encontraron registros similares"
            description={duplicateCandidate.id === editingRecordId
              ? "Revisa las coincidencias antes de guardar los cambios."
              : "Revisa las coincidencias antes de agregar otro registro."}
            itemLabel={`Pieza ${duplicateCandidate.tooth[0]}.${duplicateCandidate.tooth[1]} · ${getTreatment(duplicateCandidate.treatment).label}`}
            icon={<AlertTriangle className="size-5 text-red-600" aria-hidden="true" />}
            closeLabel="Cancelar"
            size="medium"
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className={`w-full sm:w-auto ${confirmationCancelButtonClass}`}
                  onClick={() => setDuplicateCandidate(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="w-full sm:w-auto"
                  onClick={() => commitRecord(duplicateCandidate)}
                >
                  {duplicateCandidate.id === editingRecordId ? "Guardar cambios de todos modos" : "Agregar de todos modos"}
                </Button>
              </>
            }
          >
            <ul className="max-h-48 space-y-2 overflow-y-auto border-b border-lavender-500/25 px-5 py-3 text-sm text-theme-strong">
              {duplicateMatches.map((record) => (
                <li key={record.id} className="rounded-md border border-lavender-500/25 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {record.phase === "previous" ? "Existente" : "Actual"} · {record.surfaces.length > 0
                        ? record.surfaces.map((surface) => `${surface} (${SURFACE_LABELS[surface]})`).join(", ")
                        : "pieza completa"} · {STATUS_LABELS[record.status]}
                    </span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => startEditing(record)}>
                      Editar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ConfirmationDialog>
        ) : null}
        <div className="mt-5 flex flex-col gap-4">
          <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-lavender-500/45">
            <legend className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-lavender-200">Tratamiento / hallazgo</legend>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Tratamiento / hallazgo">
              {TREATMENTS.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => { setDraftStarted(true); setTreatment(code); setDuplicateCandidate(null); }}
                  aria-pressed={treatment === code}
                  className={`${buttonClass} min-h-11 w-full text-center ${treatment === code
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:border-brand-300 dark:bg-brand-800 dark:text-brand-100"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 dark:border-lavender-500/45 dark:bg-ink-900 dark:text-ink-200 dark:hover:border-lavender-300 dark:hover:bg-lavender-800 dark:hover:text-ink-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-lavender-500/45">
              <legend className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-lavender-200">Registro</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["previous", "current"] as const).map((item) => (
                  <button key={item} type="button" onClick={() => { setDraftStarted(true); setPhase(item); setDuplicateCandidate(null); }} aria-pressed={phase === item}
                    className={`${buttonClass} h-11 ${phase === item ? item === "previous" ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-skyline-400 dark:bg-skyline-900 dark:text-skyline-400" : "border-red-600 bg-red-50 text-red-700 dark:border-coral-400 dark:bg-coral-900 dark:text-coral-400" : "border-slate-200 bg-white text-slate-600 dark:border-lavender-500/45 dark:bg-ink-900 dark:text-ink-200"}`}>
                    {item === "previous" ? "Existente (azul)" : "Actual (rojo)"}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-lavender-500/45">
              <legend className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-lavender-200">Superficies</legend>
              {selectedTreatment.scope === "surface" ? (
                <div className="grid grid-cols-6 justify-items-stretch gap-2">
                  {(selectedTooth ? availableSurfaces(selectedTooth) : (["M", "D", "V", "L", "O"] as Surface[])).map((surface, index) => {
                    const disabled = !selectedTooth;
                    const gridPosition = `col-span-2 ${index === 3 ? "col-start-2" : index === 4 ? "col-start-4" : ""}`;
                    const button = (
                      <button type="button" disabled={disabled}
                        onClick={() => selectedTooth && clickSurface(selectedTooth, surface)}
                        aria-pressed={selectedSurfaces.includes(surface)}
                        className={`${buttonClass} flex h-11 w-full min-w-0 items-center justify-center whitespace-normal px-1 py-0 text-center text-xs leading-tight ${selectedSurfaces.includes(surface) ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-400 dark:bg-amber-900 dark:text-amber-400" : "border-slate-200 bg-white text-slate-600 dark:border-lavender-500/45 dark:bg-ink-900 dark:text-ink-200"} disabled:cursor-not-allowed disabled:opacity-40`}>
                        {surface} ({SURFACE_LABELS[surface]})
                      </button>
                    );

                    return (
                      <div key={surface} className={`${gridPosition} min-w-0`}>
                        {disabled ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span tabIndex={0} aria-label={SURFACE_DISABLED_REASON}
                                  className="block w-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:focus-visible:outline-lavender-300">
                                  {button}
                                </span>
                              }
                            />
                            <TooltipContent side={surface === "L" || surface === "O" ? "bottom" : "top"} className="text-center">
                              {SURFACE_DISABLED_REASON}
                            </TooltipContent>
                          </Tooltip>
                        ) : button}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-slate-500">Este procedimiento se asigna a la pieza completa.</p>}
            </fieldset>
            <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-lavender-500/45">
              <legend className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-lavender-200">Estado</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["pending", "in_progress", "completed"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setDraftStarted(true); setStatus(item); setDuplicateCandidate(null); }}
                    aria-pressed={status === item}
                    className={`${buttonClass} flex h-11 items-center justify-center px-2 text-center text-xs sm:text-sm ${status === item
                      ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:border-brand-300 dark:bg-brand-800 dark:text-brand-100"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 dark:border-lavender-500/45 dark:bg-ink-900 dark:text-ink-200 dark:hover:border-lavender-300 dark:hover:bg-lavender-800 dark:hover:text-ink-100"}`}
                  >
                    {STATUS_LABELS[item]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div>
            <label htmlFor="odontogram-notes" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-lavender-200">Observaciones (opcional)</label>
            <textarea id="odontogram-notes" value={notes} onChange={(e) => { setDraftStarted(true); setNotes(e.target.value); setDuplicateCandidate(null); }} maxLength={1000}
              rows={2} placeholder="Notas clínicas del registro…" className={`${fieldClass} resize-y`} />
          </div>
          {notice && <p role="status" aria-live="polite" className="text-xs text-slate-700 dark:text-ink-200">{notice}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-lavender-500/40 dark:bg-lavender-950">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold">Tratamientos asignados</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-lavender-800 dark:text-lavender-200">{records.length}</span>
        </div>
        <div className="mt-4 grid max-h-[390px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {listed.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No hay registros todavía.</p>}
          {listed.map((record) => (
            <div key={record.id} className={`rounded-xl border p-3 ${record.phase === "previous" ? "border-blue-300 bg-blue-50/50 dark:border-skyline-400/55 dark:bg-skyline-900/55" : "border-red-300 bg-red-50/50 dark:border-coral-400/55 dark:bg-coral-900/55"} ${editingRecordId === record.id ? "ring-2 ring-blue-500/60 dark:ring-brand-300/60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold dark:bg-lavender-800 dark:text-ink-100">{record.tooth[0]}.{record.tooth[1]}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => startEditing(record)} disabled={editingRecordId === record.id}
                    aria-label={`Editar registro ${getTreatment(record.treatment).label} del diente ${record.tooth}`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-default disabled:opacity-60 dark:text-skyline-300 dark:hover:bg-skyline-900/60">
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {editingRecordId === record.id ? "Editando" : "Editar"}
                  </button>
                  <button type="button" onClick={() => setRecordPendingDelete(record)} title="Eliminar este registro"
                  disabled={editingRecordId === record.id}
                  aria-label={`Eliminar registro ${getTreatment(record.treatment).label} del diente ${record.tooth}`}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-ink-300 dark:hover:bg-coral-900 dark:hover:text-coral-400">✕</button>
                </div>
              </div>
              <p className="mt-2 break-words text-sm font-semibold">{getTreatment(record.treatment).label}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-lavender-200">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: recordColor(record.phase) }} />{record.phase === "previous" ? "Existente" : "Actual"}</span>
                {record.surfaces.length > 0 && <span>· {record.surfaces.join(" / ")}</span>}
              </div>
              {record.notes && <p className="mt-2 text-xs text-slate-600 dark:text-ink-200">{record.notes}</p>}
              <select value={record.status} onChange={(e) => changeRecordStatus(record.id, e.target.value as TreatmentStatus)}
                disabled={editingRecordId === record.id}
                title={editingRecordId === record.id ? "Edita el estado en el formulario y guarda los cambios." : undefined}
                aria-label={`Estado de ${getTreatment(record.treatment).label} en el diente ${record.tooth}`}
                className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-lavender-500/45 dark:bg-ink-900 dark:text-ink-200">
                {Object.entries(STATUS_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </div>
          ))}
        </div>
        {onSave ? (
          <div className="mt-4 grid grid-cols-4 gap-2">
            <button
              ref={saveInExpedienteButtonRef}
              onClick={save}
              type="button"
              disabled={!dirty || saving || conflictSnapshot !== null}
              className="col-span-3 min-w-0 rounded-lg bg-slate-900 px-2 py-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-brand-700 dark:hover:bg-brand-600 dark:disabled:bg-ink-700 dark:disabled:text-ink-400 sm:px-4 sm:text-sm"
            >
              {saving ? "Guardando…" : conflictSnapshot ? "Resuelve el conflicto para guardar" : dirty ? "Guardar en expediente" : "Sin cambios pendientes"}
            </button>
            <Button
              type="button"
              onClick={() => setDiscardConfirmationOpen(true)}
              disabled={!hasUnsavedChanges || saving || navigationSaving}
              variant="danger"
              className="col-span-1 h-auto min-h-12 w-full min-w-0 rounded-lg px-1 py-3 text-xs font-semibold hover:bg-red-700 dark:hover:bg-coral-400 sm:px-3 sm:text-sm"
            >
              Cancelar
            </Button>
          </div>
        ) : null}
        {conflictSnapshot ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-300/35 dark:bg-amber-950/35 dark:text-amber-100" role="alert">
            <p>
              La versión guardada ahora es la revisión {conflictSnapshot.revision} y contiene {conflictSnapshot.records.length} tratamientos. Tu borrador sigue en pantalla.
            </p>
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-amber-300/70 bg-white/70 p-2 dark:border-amber-300/20 dark:bg-ink-950/50">
              {conflictSnapshot.records.length === 0 ? (
                <p className="p-2 text-xs">La versión guardada no tiene tratamientos activos.</p>
              ) : conflictSnapshot.records.map((record) => (
                <article key={record.id} className="rounded-md border border-amber-200/80 p-2 dark:border-amber-300/15">
                  <p className="font-semibold">
                    Pieza {record.tooth[0]}.{record.tooth[1]} · {getTreatment(record.treatment).label}
                  </p>
                  <p className="text-xs">
                    {record.phase === "previous" ? "Existente" : "Actual"} · {record.surfaces.length > 0 ? record.surfaces.join(" / ") : "Pieza completa"} · {STATUS_LABELS[record.status]}
                  </p>
                  {record.notes ? <p className="mt-1 break-words text-xs">{record.notes}</p> : null}
                </article>
              ))}
            </div>
            <button
              type="button"
              onClick={loadConflictSnapshot}
              className="mt-3 rounded-lg border border-amber-500/60 bg-white px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-amber-300/40 dark:bg-ink-900 dark:text-amber-100 dark:hover:bg-amber-900/50"
            >
              Descartar mi borrador y cargar la versión guardada
            </button>
          </div>
        ) : null}
        {history.length > 0 ? (
          <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-lavender-500/35 dark:bg-ink-900/60">
            <summary className="cursor-pointer font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-ink-100 dark:focus-visible:outline-lavender-300">
              Historial de versiones ({history.length})
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {history.map((version) => (
                <article key={version.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-lavender-500/35 dark:bg-lavender-950">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold dark:bg-lavender-800 dark:text-ink-100">
                      {version.tooth[0]}.{version.tooth[1]}
                    </span>
                    <span className={`text-xs font-semibold ${version.changeType === "retired" ? "text-red-700 dark:text-coral-300" : "text-blue-700 dark:text-skyline-300"}`}>
                      {version.changeType === "retired" ? "Tratamiento retirado" : "Versión sustituida"}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold">{getTreatment(version.treatment).label}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-ink-200">
                    {version.phase === "previous" ? "Existente" : "Actual"} · {version.surfaces.length > 0 ? version.surfaces.join(" / ") : "Pieza completa"} · {STATUS_LABELS[version.status]}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-lavender-200">
                    Registrado {formatHistoryDate(version.recordCreatedAt)} · reemplazado {formatHistoryDate(version.changedAt)}
                  </p>
                  {version.notes ? <p className="mt-2 break-words text-xs text-slate-600 dark:text-ink-200">{version.notes}</p> : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>
      <ConfirmDeleteModal
        open={recordPendingDelete !== null}
        title="¿Estás seguro que quieres ELIMINAR?"
        description="Se eliminará este tratamiento del odontograma."
        itemLabel={recordPendingDelete
          ? `Pieza ${recordPendingDelete.tooth[0]}.${recordPendingDelete.tooth[1]} · ${getTreatment(recordPendingDelete.treatment).label}`
          : undefined}
        onCancel={() => setRecordPendingDelete(null)}
        onConfirm={confirmDeleteRecord}
      />
    </div >
  );
}
