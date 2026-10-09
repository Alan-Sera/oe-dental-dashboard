"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent,
} from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { missingFilesToastManager } from "@/components/toast-providers";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  FileText,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  Maximize2,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Search,
  Table2,
  Trash2,
  UploadCloud,
  UserCircle2,
  X,
} from "lucide-react";

import { categoryLabels } from "@/constants";
import type { SerializedAttachment, SerializedPatientDetail } from "@/types";
import { isPatientPhotoOrRadiograph } from "@/lib/patient-media";
import {
  linkTextAttachmentAsClinicalHistory,
  updateLinkedTextClinicalHistory,
} from "@/lib/actions/clinical.actions";
import { retryPaymentHistorySheetUpload, setActivePaymentHistorySheet } from "@/lib/actions/payment-history.actions";
import {
  detectPreferredLineEnding,
  isPlainTextAttachment,
} from "@/lib/text-attachments";
import {
  appendTextHistoryAppointment,
  createTextHistoryAppointment,
  hasNoShowText,
  markTextHistoryAppointmentNoShow,
  normalizeTextHistoryAppointment,
  parseLinkedTextHistory,
  removeTextHistoryAppointment,
  replaceTextHistoryAppointment,
  serializeDeletedTextHistoryBlockBackup,
  serializeLinkedTextHistory,
  serializeTextHistoryAppointmentBlock,
  serializeTextHistoryNextBlock,
  type DeletedTextHistoryBlockBackup,
  type ParsedTextHistory,
  type ParsedTextHistoryAppointment,
} from "@/lib/text-history-parser";
import {
  getTextHistoryHighlightSegments,
  getTextHistorySearchSummary,
} from "@/lib/text-history-search";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { isPaymentHistoryUploadInProgress } from "@/lib/payment-history-upload-state";
import { toDateKey } from "@/lib/date-utils";
import { appointmentStatusLabels } from "@/components/schedule/constants";
import type { AgendaAppointment } from "@/components/schedule/types";
import { getAppointmentNextAnchor, getRecentAttendance } from "@/lib/attendance";
import type { AttendanceItem } from "@/lib/attendance";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { PatientAttendanceSummary } from "@/components/patient-attendance-summary";
import { useGlobalLoading } from "@/components/loading-provider";
import {
  PendingEditsModal,
  type PendingEditItem,
} from "@/components/pending-edits-modal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PaymentForm,
  TreatmentChargeForm,
} from "@/components/forms/ledger-forms";
import { PatientForm } from "@/components/forms/patient-form";
import { setPatientProfilePhoto } from "@/lib/actions/patient.actions";

const historyDeleteButtonClass =
  "border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md hover:bg-coral-500 hover:text-white";
const historyEditButtonClass =
  "border-brand-400/55 bg-brand-900/60 text-brand-200 backdrop-blur-md hover:bg-brand-500 hover:text-white";
const historyNoShowButtonClass =
  "w-fit border-transparent bg-coral-950/30 text-red-400 backdrop-blur-md hover:border-transparent hover:bg-coral-900/55 hover:text-red-200";
const historyCancelButtonClass =
  "bg-lavender-700/40 text-lavender-50 hover:bg-lavender-700/55 hover:text-white";
const filterLinkedTextHistorySearchResults = true;

function formatAppointmentTime(value: string) {
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function appointmentStatusToneClass(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "border-brand-400/40 bg-brand-900/60 text-brand-200";
    case "COMPLETED":
      return "border-emerald-400/40 bg-emerald-950/50 text-emerald-300";
    case "CANCELLED":
      return "border-coral-500/40 bg-coral-950/50 text-coral-300";
    case "NO_SHOW":
      return "border-amber-500/40 bg-amber-950/50 text-amber-300";
    default:
      return "border-lavender-500/40 bg-lavender-900/50 text-lavender-100";
  }
}

export function PatientDetailTabs({
  patient,
  missingAttachmentIds = [],
  upcomingAppointments = []
}: {
  patient: SerializedPatientDetail;
  missingAttachmentIds?: string[];
  upcomingAppointments?: AgendaAppointment[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("summary");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  function handleNewAppointmentForPatient() {
    const date = upcomingAppointments[0]
      ? toDateKey(new Date(upcomingAppointments[0].startTime))
      : toDateKey(new Date());
    router.push(`/agenda?view=day&date=${date}&paciente=${patient.id}`);
  }

  function openAppointmentOnAgenda(appointment: AgendaAppointment) {
    router.push(`/agenda?view=day&date=${toDateKey(new Date(appointment.startTime))}&cita=${appointment.id}`);
  }
  const [pendingInitialImageIds, setPendingInitialImageIds] = useState<
    Set<string>
  >(() => new Set());
  const [textHistoryLinkError, setTextHistoryLinkError] = useState<
    string | null
  >(null);
  const [pendingTextHistoryAttachmentId, setPendingTextHistoryAttachmentId] =
    useState<string | null>(null);
  const [isLinkingTextHistory, startLinkingTextHistoryTransition] =
    useTransition();
  const { show: showLoading, hide: hideLoading } = useGlobalLoading();
  const mediaLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const mediaOverlayVisibleRef = useRef(false);
  const toastedMissingRef = useRef(new Set<string>());
  const photos = useMemo(
    () =>
      patient.attachments.filter(isPatientPhotoOrRadiograph),
    [patient.attachments],
  );
  const activePaymentHistory = patient.paymentHistorySheets.find(
    (sheet) => sheet.isActive,
  );
  const missingAttachmentIdSet = useMemo(
    () => new Set(missingAttachmentIds),
    [missingAttachmentIds],
  );
  const initialMediaImageIds = useMemo(
    () =>
      photos
        .filter((attachment) =>
          isPreviewableAttachment(attachment, missingAttachmentIdSet),
        )
        .slice(0, 6)
        .map((attachment) => attachment.id),
    [missingAttachmentIdSet, photos],
  );
  const viewablePhotos = useMemo(
    () =>
      photos.filter((attachment) =>
        isPreviewableAttachment(attachment, missingAttachmentIdSet),
      ),
    [missingAttachmentIdSet, photos],
  );
  const selectedPhotoIndex = selectedPhotoId
    ? viewablePhotos.findIndex((photo) => photo.id === selectedPhotoId)
    : -1;
  const recentAttendance = useMemo(
    () => getRecentAttendance(patient.clinicalEntries, 4),
    [patient.clinicalEntries]
  );

  useEffect(() => {
    if (missingAttachmentIds.length > 0) {
      const key = `${patient.id}:${missingAttachmentIds.length}`;
      if (!toastedMissingRef.current.has(key)) {
        toastedMissingRef.current.add(key);
        missingFilesToastManager.add({
          id: `missing-files-${patient.id}`,
          title: "Archivos no encontrados",
          description: `${missingAttachmentIds.length} archivo(s) vinculado(s) no existen en la ruta configurada.`,
          type: "warning",
        });
      }
    }
  }, [missingAttachmentIds.length, patient.id, toastedMissingRef]);

  useEffect(() => {
    // Reset toast state when patient changes or missing count changes significantly
    toastedMissingRef.current = new Set();
  }, [patient.id]);

  const stopMediaLoading = useCallback(() => {
    if (mediaLoadTimeoutRef.current) {
      clearTimeout(mediaLoadTimeoutRef.current);
      mediaLoadTimeoutRef.current = null;
    }

    if (mediaOverlayVisibleRef.current) {
      mediaOverlayVisibleRef.current = false;
      hideLoading();
    }
  }, [hideLoading]);

  const startMediaLoading = useCallback(() => {
    if (!initialMediaImageIds.length) {
      setPendingInitialImageIds(new Set());
      stopMediaLoading();
      return;
    }

    if (mediaOverlayVisibleRef.current) {
      hideLoading();
    }

    mediaOverlayVisibleRef.current = true;
    setPendingInitialImageIds(new Set(initialMediaImageIds));
    showLoading("Cargando imágenes...");

    if (mediaLoadTimeoutRef.current) {
      clearTimeout(mediaLoadTimeoutRef.current);
    }

    mediaLoadTimeoutRef.current = setTimeout(() => {
      setPendingInitialImageIds(new Set());
      stopMediaLoading();
    }, 4500);
  }, [hideLoading, initialMediaImageIds, showLoading, stopMediaLoading]);

  const handlePreviewSettled = useCallback((attachmentId: string) => {
    setPendingInitialImageIds((current) => {
      if (!current.has(attachmentId)) return current;

      const next = new Set(current);
      next.delete(attachmentId);
      return next;
    });
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      if (value === "media") {
        startMediaLoading();
      } else {
        stopMediaLoading();
      }

      setActiveTab(value);
    },
    [startMediaLoading, stopMediaLoading],
  );

  const handleViewNext = useCallback(
    (item: AttendanceItem) => {
      handleTabChange("clinical");

      window.setTimeout(() => {
        const target = document.getElementById(getAppointmentNextAnchor(item));
        if (!target) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        target.focus({ preventScroll: true });
      }, 80);
    },
    [handleTabChange],
  );

  const handleLinkTextHistory = useCallback(
    (attachmentId: string) => {
      setTextHistoryLinkError(null);
      setPendingTextHistoryAttachmentId(attachmentId);
      showLoading("Vinculando historia...");

      startLinkingTextHistoryTransition(async () => {
        try {
          await linkTextAttachmentAsClinicalHistory({
            patientId: patient.id,
            attachmentId,
          });
          router.refresh();
        } catch (error) {
          setTextHistoryLinkError(
            error instanceof Error
              ? error.message
              : "No se pudo vincular la historia",
          );
        } finally {
          hideLoading();
          setPendingTextHistoryAttachmentId(null);
        }
      });
    },
    [
      hideLoading,
      patient.id,
      router,
      showLoading,
      startLinkingTextHistoryTransition,
    ],
  );

  useEffect(() => {
    if (activeTab !== "media") {
      stopMediaLoading();
    }
  }, [activeTab, stopMediaLoading]);

  useEffect(() => {
    if (activeTab === "media" && pendingInitialImageIds.size === 0) {
      stopMediaLoading();
    }
  }, [activeTab, pendingInitialImageIds, stopMediaLoading]);

  useEffect(() => stopMediaLoading, [stopMediaLoading]);

  return (
    <>
      <Tabs.Root
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-2.5"
      >
        <Tabs.List className="flex gap-2 overflow-x-auto rounded-lg border border-lavender-600/55 bg-lavender-900/35 p-1">
          <Tab value="summary" icon={FileText} label="Resumen" />
          <Tab value="media" icon={ImageIcon} label="Fotos" />
          <Tab value="clinical" icon={NotebookPen} label="Historia" />
          {/* <Tab value="ledger" icon={BadgeDollarSign} label="Cuenta" /> */}
          <Tab value="payment-history" icon={Table2} label="Historial pagos" />
          <Tab value="files" icon={FolderOpen} label="Archivos" />
        </Tabs.List>

        <Tabs.Content value="summary" className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <h2 className="section-title mb-4">Datos del paciente</h2>
              <PatientForm
                patientId={patient.id}
                defaultValues={{
                  fullName: patient.fullName,
                  email: patient.email ?? "",
                  phone: patient.phone ?? "",
                  phoneUnavailable: patient.phoneUnavailable,
                  birthDate: patient.birthDate?.slice(0, 10) ?? "",
                  gender: patient.gender ?? "",
                  nextAppointmentDate:
                    patient.nextAppointmentDate?.slice(0, 10) ?? "",
                  notes: patient.notes ?? "",
                }}
              />
            </Card>

            <Card className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-lavender-800/55 text-lavender-100 ring-1 ring-lavender-300/25">
                    <CalendarDays className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="section-title">Historial de asistencias</h2>
                    <p className="text-sm text-lavender-200/55">
                      Citas del paciente
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-w-full border-emerald-300/45 bg-emerald-700/70 px-5 text-white shadow-sm shadow-emerald-950/30 hover:border-emerald-200/70 hover:bg-emerald-600"
                  onClick={handleNewAppointmentForPatient}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Nueva Cita
                </Button>
              </div>
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-lavender-200/45">
                    Próximas citas programadas
                  </p>
                  <ul className="space-y-2">
                    {upcomingAppointments
                      .slice(0, 2)
                      .map((appointment) => (
                        <li key={appointment.id}>
                          <button
                            type="button"
                            onClick={() => openAppointmentOnAgenda(appointment)}
                            className="flex w-full items-center justify-between gap-3 rounded-md border border-lavender-500/25 bg-lavender-950/18 px-3 py-2 text-left transition hover:border-brand-400/50 hover:bg-lavender-800/30"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {appointment.title}
                                {!appointment.googleEventId ? (
                                  <CloudOff
                                    className="ml-1.5 inline size-3.5 text-amber-300/90"
                                    aria-label="Sin sincronizar con Google Calendar"
                                  />
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-lavender-200/60">
                                {formatAppointmentTime(appointment.startTime)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
                                appointmentStatusToneClass(appointment.status)
                              )}
                            >
                              {appointmentStatusLabels[appointment.status] ?? appointment.status}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <PatientAttendanceSummary
                nextAppointmentDate={patient.nextAppointmentDate}
                items={recentAttendance}
                onViewNext={handleViewNext}
                showNextAppointment={false}
              />
            </Card>
          </div>
        </Tabs.Content>

        <Tabs.Content
          value="media"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {photos.length > 0 ? (
            photos.map((attachment, index) => (
              <AttachmentTile
                key={attachment.id}
                attachment={attachment}
                patientId={patient.id}
                profilePhotoId={patient.profilePhotoId}
                missing={missingAttachmentIdSet.has(attachment.id)}
                priority={index < 6}
                onPreviewSettled={handlePreviewSettled}
                onOpen={
                  isPreviewableAttachment(attachment, missingAttachmentIdSet)
                    ? () => setSelectedPhotoId(attachment.id)
                    : undefined
                }
              />
            ))
          ) : (
            <EmptyState text="Sin fotos o radiografías importadas" />
          )}
        </Tabs.Content>

        <Tabs.Content value="clinical" className="space-y-5">
          <div className="space-y-3">
            {patient.clinicalEntries.length > 0 ? (
              patient.clinicalEntries.map((entry) => (
                <ClinicalEntryCard
                  key={entry.id}
                  patientId={patient.id}
                  entry={entry}
                />
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
                  amount: formatCurrency(charge.amountCents, charge.currency),
                }))}
              />
              <LedgerList
                title="Pagos"
                rows={patient.payments.map((payment) => ({
                  id: payment.id,
                  primary: payment.method,
                  secondary: `${formatDate(payment.paidAt)} · ${payment.status}`,
                  amount: formatCurrency(payment.amountCents, payment.currency),
                }))}
              />
            </div>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="payment-history" className="space-y-5">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="section-title">Historial de pagos activo</h2>
                <p className="mt-1 text-sm text-lavender-200/60">
                  Archivo local importado y, cuando esté conectado, convertido a
                  Google Sheets.
                </p>
              </div>
              {activePaymentHistory ? (
                <PaymentHistoryStatusBadge
                  status={activePaymentHistory.uploadStatus}
                  uploadStartedAt={activePaymentHistory.uploadStartedAt}
                />
              ) : null}
            </div>

            {activePaymentHistory ? (
              <PaymentHistoryPanel
                patientId={patient.id}
                sheet={activePaymentHistory}
                missing={missingAttachmentIdSet.has(
                  activePaymentHistory.attachment.id,
                )}
                featured
              />
            ) : (
              <EmptyState text="Sin historial activo. Importa un .xlsx o elige uno de la lista como historial activo." />
            )}
          </Card>
        </Tabs.Content>

        <Tabs.Content value="files" className="space-y-3">
          {textHistoryLinkError ? (
            <div className="surface flex gap-3 p-4 text-sm text-coral-300">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <p>{textHistoryLinkError}</p>
            </div>
          ) : null}

          {patient.attachments.length > 0 ? (
            patient.attachments.map((attachment) => {
              const missing = missingAttachmentIdSet.has(attachment.id);
              const isTextFile = isPlainTextAttachment(
                attachment.originalName,
                attachment.mimeType,
              );
              const linkedToHistory = Boolean(attachment.clinicalEntryId);
              const categoryBadgeTone =
                attachment.category === "CLINICAL_HISTORY"
                  ? "mint"
                  : attachment.category === "PAYMENT_HISTORY"
                    ? "green"
                    : "neutral";
              const linkingThisHistory =
                pendingTextHistoryAttachmentId === attachment.id;

              return (
                <Card
                  key={attachment.id}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-ink-100">
                      {attachment.originalName}
                    </p>
                    <p className="text-sm text-lavender-200/55">
                      {attachment.sourceRelativePath}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isTextFile ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className={cn(
                          !linkedToHistory
                            ? "border-brand-300/45 bg-brand-700/60 text-white hover:border-brand-200/60 hover:bg-brand-600"
                            : "border-emerald-300/45 bg-emerald-700/70",
                        )}
                        disabled={
                          missing || linkedToHistory || isLinkingTextHistory
                        }
                        onClick={() => handleLinkTextHistory(attachment.id)}
                      >
                        {linkedToHistory ? (
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        ) : linkingThisHistory ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <NotebookPen className="size-4" aria-hidden="true" />
                        )}
                        {linkedToHistory
                          ? "Vinculado"
                          : linkingThisHistory
                            ? "Vinculando..."
                            : "Vincular historia"}
                      </Button>
                    ) : null}
                    <Badge tone={categoryBadgeTone}>
                      {categoryLabels[attachment.category]}
                    </Badge>
                    {missing ? <Badge tone="coral">Faltante</Badge> : null}
                    {missing ? (
                      <span className="text-sm text-lavender-200/35">
                        No disponible
                      </span>
                    ) : (
                      <Link
                        href={`/api/files/${attachment.id}`}
                        target="_blank"
                        className="text-sm text-lavender-200 hover:text-white"
                      >
                        Abrir
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState text="Sin archivos importados" />
          )}
        </Tabs.Content>
      </Tabs.Root>

      {selectedPhotoIndex >= 0 ? (
        <PatientPhotoViewer
          patientName={patient.fullName}
          photos={viewablePhotos}
          currentIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoId(null)}
          onNavigate={(nextIndex) =>
            setSelectedPhotoId(viewablePhotos[nextIndex]?.id ?? null)
          }
        />
      ) : null}
    </>
  );
}

function ClinicalEntryCard({
  patientId,
  entry,
}: {
  patientId: string;
  entry: SerializedPatientDetail["clinicalEntries"][number];
}) {
  const router = useRouter();
  const loading = useGlobalLoading();
  const linkedTextAttachment = getLinkedTextAttachment(entry);
  const linkedTextPath = linkedTextAttachment
    ? splitAttachmentSourcePath(
      linkedTextAttachment.sourceRelativePath,
      linkedTextAttachment.originalName,
    )
    : null;
  const parsedHistory = useMemo(
    () => parseLinkedTextHistory(entry.notes),
    [entry.notes],
  );
  const [history, setHistory] = useState<ParsedTextHistory>(
    () => parsedHistory,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setHistory(parsedHistory);
    setError(null);
  }, [parsedHistory]);

  const saveHistory = useCallback(
    async (
      nextHistory: ParsedTextHistory,
      deletedBlockBackup?: DeletedTextHistoryBlockBackup,
    ) => {
      if (!linkedTextAttachment || isSaving) return false;

      setError(null);
      setIsSaving(true);
      loading.show("Guardando historia...");

      try {
        const nextNotes = serializeLinkedTextHistory(
          nextHistory,
          detectPreferredLineEnding(entry.notes),
        );

        await updateLinkedTextClinicalHistory({
          patientId,
          clinicalEntryId: entry.id,
          notes: nextNotes,
          deletedBlockBackup,
        });
        setHistory(nextHistory);
        router.refresh();
        return true;
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "No se pudo guardar la historia",
        );
        return false;
      } finally {
        setIsSaving(false);
        loading.hide();
      }
    },
    [
      entry.id,
      entry.notes,
      isSaving,
      linkedTextAttachment,
      loading,
      patientId,
      router,
    ],
  );

  return (
    <Card
      className={cn(
        "space-y-4",
        linkedTextAttachment
          ? "border-l-2 border-l-brand-400/35 border-lavender-500/35 bg-lavender-950/18 shadow-none ring-1 ring-white/[0.03]"
          : undefined,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {linkedTextAttachment ? (
            <div className="min-w-0 rounded-md border border-lavender-500/30 bg-lavender-950/24 px-3 py-2">
              <p className="truncate text-xs text-lavender-200/60">
                {linkedTextPath?.folderName ? (
                  <>
                    <span>{linkedTextPath.folderName}</span>
                    <span className="px-1 text-lavender-200/35">/</span>
                  </>
                ) : null}
                <span className="font-medium text-lavender-100">
                  {linkedTextPath?.fileName ??
                    linkedTextAttachment.originalName}
                </span>
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{formatDate(entry.entryDate)}</Badge>
              {entry.tooth ? <Badge>Pieza {entry.tooth}</Badge> : null}
              {entry.attachments.length ? (
                <Badge tone="sky">{entry.attachments.length} archivo(s)</Badge>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {entry.diagnosis ? (
        <p className="text-sm text-ink-300">Diagnóstico: {entry.diagnosis}</p>
      ) : null}
      {entry.treatment ? (
        <p className="text-sm text-ink-300">Tratamiento: {entry.treatment}</p>
      ) : null}

      {error ? (
        <div className="surface flex gap-3 p-3 text-sm text-coral-300">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p>{error}</p>
        </div>
      ) : null}

      {linkedTextAttachment ? (
        <LinkedTextHistoryBlocks
          entryId={entry.id}
          history={history}
          disabled={isSaving}
          onSave={saveHistory}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-lavender-200/65">
          {entry.notes}
        </p>
      )}
    </Card>
  );
}

type SaveLinkedTextHistory = (
  nextHistory: ParsedTextHistory,
  deletedBlockBackup?: DeletedTextHistoryBlockBackup,
) => Promise<boolean>;

type HistoryEditingChange = (
  block: PendingEditItem,
  isEditing: boolean,
) => void;

function LinkedTextHistoryBlocks({
  entryId,
  history,
  disabled,
  onSave,
}: {
  entryId: string;
  history: ParsedTextHistory;
  disabled: boolean;
  onSave: SaveLinkedTextHistory;
}) {
  const [newAppointment, setNewAppointment] =
    useState<ParsedTextHistoryAppointment | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingBlocks, setEditingBlocks] = useState<PendingEditItem[]>([]);
  const [pendingEditsModalOpen, setPendingEditsModalOpen] = useState(false);
  const searchSummary = useMemo(
    () => getTextHistorySearchSummary(history, searchQuery),
    [history, searchQuery],
  );
  const hasSearchQuery = searchSummary.hasQuery;
  const matchingAppointmentIndexes = useMemo(
    () => new Set(searchSummary.appointmentMatches.map((match) => match.index)),
    [searchSummary.appointmentMatches],
  );
  const appointmentRows = useMemo(
    () =>
      history.appointments
        .map((appointment, index) => ({ appointment, index }))
        .filter(
          ({ index }) =>
            !filterLinkedTextHistorySearchResults ||
            !hasSearchQuery ||
            matchingAppointmentIndexes.has(index),
        ),
    [hasSearchQuery, history.appointments, matchingAppointmentIndexes],
  );
  const showInformationBlock = true;
  const hasPendingEdits = editingBlocks.length > 0;

  useEffect(() => {
    setNewAppointment(null);
  }, [history]);

  const registerEditingBlock = useCallback<HistoryEditingChange>(
    (block, isEditing) => {
      setEditingBlocks((current) => {
        const existingIndex = current.findIndex((item) => item.id === block.id);

        if (isEditing) {
          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = block;
            return next;
          }

          return [...current, block];
        }

        if (existingIndex < 0) return current;

        return current.filter((item) => item.id !== block.id);
      });
    },
    [],
  );

  const requestSearchChange = useCallback(
    (nextQuery: string) => {
      if (hasPendingEdits) {
        setPendingEditsModalOpen(true);
        return;
      }

      setSearchQuery(nextQuery);
    },
    [hasPendingEdits],
  );

  const saveInformation = useCallback(
    (information: string) => onSave({ ...history, information }),
    [history, onSave],
  );

  const saveAppointment = useCallback(
    (index: number, appointment: ParsedTextHistoryAppointment) =>
      onSave(replaceTextHistoryAppointment(history, index, appointment)),
    [history, onSave],
  );

  const addAppointment = useCallback(
    (appointment: ParsedTextHistoryAppointment) =>
      onSave(appendTextHistoryAppointment(history, appointment)),
    [history, onSave],
  );

  const deleteAppointment = useCallback(
    (index: number) => {
      const appointment = history.appointments[index];
      if (!appointment) return Promise.resolve(false);

      const label = `Cita ${index + 1} - ${appointment.dateText || "Sin fecha"}`;

      return onSave(removeTextHistoryAppointment(history, index), {
        type: "appointment",
        label,
        content: serializeDeletedTextHistoryBlockBackup({
          type: "appointment",
          label,
          content: serializeTextHistoryAppointmentBlock(appointment),
        }),
      });
    },
    [history, onSave],
  );

  const saveNext = useCallback(
    (index: number, next: string) => {
      const appointment = history.appointments[index];
      if (!appointment) return Promise.resolve(false);

      return onSave(
        replaceTextHistoryAppointment(history, index, {
          ...appointment,
          next,
          hasNext: true,
        }),
      );
    },
    [history, onSave],
  );

  const deleteNext = useCallback(
    (index: number) => {
      const appointment = history.appointments[index];
      if (!appointment) return Promise.resolve(false);

      const label = `NEXT de cita ${index + 1} - ${appointment.dateText || "Sin fecha"}`;

      return onSave(
        replaceTextHistoryAppointment(history, index, {
          ...appointment,
          next: "",
          hasNext: false,
        }),
        {
          type: "next",
          label,
          content: serializeDeletedTextHistoryBlockBackup({
            type: "next",
            label,
            content: serializeTextHistoryNextBlock(appointment.next),
          }),
        },
      );
    },
    [history, onSave],
  );

  return (
    <div className="space-y-4">
      {showInformationBlock ? (
        <LinkedTextInformationBlock
          information={history.information}
          disabled={disabled}
          searchQuery={searchQuery}
          onEditingChange={registerEditingBlock}
          onSave={saveInformation}
        />
      ) : null}

      <section className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[auto_minmax(14rem,1fr)_auto] lg:items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-lavender-50">Citas</h3>
            <Badge tone="neutral">{history.appointments.length} cita(s)</Badge>
            {hasSearchQuery ? (
              <Badge
                tone={searchSummary.totalMatches > 0 ? "amber" : "neutral"}
              >
                {searchSummary.totalMatches} coincidencia(s)
              </Badge>
            ) : null}
          </div>
          <div className="relative w-full lg:mx-auto lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lavender-200/55" />
            <Input
              value={searchQuery}
              onFocus={() => {
                if (hasPendingEdits) setPendingEditsModalOpen(true);
              }}
              onChange={(event) => requestSearchChange(event.target.value)}
              placeholder="Buscar en historia"
              className="h-10 rounded-full pl-10 pr-10 hover:border-lavender-300/60 hover:bg-lavender-800/50"
              aria-label="Buscar palabras en historia"
              disabled={disabled}
            />
            {hasSearchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                aria-label="Limpiar búsqueda en historia"
                disabled={disabled}
                onClick={() => requestSearchChange("")}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-w-36 border-emerald-300/45 bg-emerald-700/70 px-5 text-white shadow-sm shadow-emerald-950/30 hover:border-emerald-200/70 hover:bg-emerald-600"
            disabled={disabled || Boolean(newAppointment)}
            onClick={() => setNewAppointment(createTextHistoryAppointment())}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva cita
          </Button>
        </div>

        {appointmentRows.length > 0 || newAppointment ? (
          <>
            {appointmentRows.map(({ appointment, index }) => (
              <LinkedTextAppointmentBlock
                key={`${appointment.dateText}-${index}`}
                entryId={entryId}
                appointment={appointment}
                index={index}
                disabled={disabled}
                searchQuery={searchQuery}
                onEditingChange={registerEditingBlock}
                onSave={(nextAppointment) =>
                  saveAppointment(index, nextAppointment)
                }
                onDelete={() => deleteAppointment(index)}
                onSaveNext={(next) => saveNext(index, next)}
                onDeleteNext={() => deleteNext(index)}
              />
            ))}
            {newAppointment ? (
              <LinkedTextAppointmentBlock
                key="new-appointment"
                entryId={entryId}
                appointment={newAppointment}
                index={history.appointments.length}
                disabled={disabled}
                isNew
                searchQuery={searchQuery}
                onEditingChange={registerEditingBlock}
                onSave={async (appointment) => {
                  const saved = await addAppointment(appointment);
                  if (saved) setNewAppointment(null);
                  return saved;
                }}
                onCancelNew={() => setNewAppointment(null)}
                onDelete={() => Promise.resolve(false)}
                onSaveNext={(next) => {
                  setNewAppointment((prev) =>
                    prev ? { ...prev, next, hasNext: true } : prev,
                  );
                  return Promise.resolve(true);
                }}
                onDeleteNext={() => Promise.resolve(false)}
              />
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-lavender-500/35 p-5 text-sm text-lavender-200/50">
            {hasSearchQuery
              ? "Sin coincidencias en citas"
              : "Sin citas detectadas"}
          </div>
        )}
      </section>

      <PendingEditsModal
        open={pendingEditsModalOpen}
        items={editingBlocks}
        onClose={() => setPendingEditsModalOpen(false)}
      />
    </div>
  );
}

function LinkedTextInformationBlock({
  information,
  disabled,
  searchQuery,
  onEditingChange,
  onSave,
}: {
  information: string;
  disabled: boolean;
  searchQuery: string;
  onEditingChange: HistoryEditingChange;
  onSave: (information: string) => Promise<boolean>;
}) {
  const informationId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(information);
  const [isSaving, setIsSaving] = useState(false);
  const hasInformation = information.trim().length > 0;

  useEffect(() => {
    if (!isEditing) {
      setDraft(information);
    }
  }, [information, isEditing]);

  useEffect(() => {
    onEditingChange({ id: "information", label: "Información" }, isEditing);

    return () => {
      onEditingChange({ id: "information", label: "Información" }, false);
    };
  }, [isEditing, onEditingChange]);

  const cancelEditing = useCallback(() => {
    setDraft(information);
    setIsEditing(false);
  }, [information]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const saved = await onSave(draft);
    setIsSaving(false);

    if (saved) {
      setIsEditing(false);
    }
  }, [draft, onSave]);

  return (
    <section className="rounded-lg border border-lavender-500/30 bg-lavender-950/24 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText
            className="size-4 text-lavender-200/70"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-lavender-50">
            Información
          </h3>
        </div>
        <BlockActions
          isEditing={isEditing}
          isSaving={isSaving}
          disabled={disabled}
          onEdit={() => setIsEditing(true)}
          onCancel={cancelEditing}
          onSave={handleSave}
        />
      </div>

      {isEditing ? (
        <Textarea
          id={informationId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-32 font-mono text-sm leading-6"
          placeholder="Información del paciente"
          disabled={disabled || isSaving}
        />
      ) : hasInformation ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-lavender-100/72">
          <HighlightedHistoryText text={information} query={searchQuery} />
        </p>
      ) : (
        <p className="text-sm text-lavender-200/45">
          Sin información previa registrada
        </p>
      )}
    </section>
  );
}

function LinkedTextAppointmentBlock({
  entryId,
  appointment,
  index,
  disabled,
  isNew = false,
  searchQuery,
  onEditingChange,
  onSave,
  onCancelNew,
  onDelete,
  onSaveNext,
  onDeleteNext,
}: {
  entryId: string;
  appointment: ParsedTextHistoryAppointment;
  index: number;
  disabled: boolean;
  isNew?: boolean;
  searchQuery: string;
  onEditingChange: HistoryEditingChange;
  onSave: (appointment: ParsedTextHistoryAppointment) => Promise<boolean>;
  onCancelNew?: () => void;
  onDelete: () => Promise<boolean>;
  onSaveNext: (next: string) => Promise<boolean>;
  onDeleteNext: () => Promise<boolean>;
}) {
  const dateId = useId();
  const bodyId = useId();
  const [isEditing, setIsEditing] = useState(isNew);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState<ParsedTextHistoryAppointment>(
    () => appointment,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNextEditing, setIsNextEditing] = useState(false);
  const visibleAppointment = isEditing
    ? normalizeTextHistoryAppointment(draft)
    : appointment;
  const hasBody = visibleAppointment.body.trim().length > 0;
  const hasNoShow = hasNoShowText(
    `${visibleAppointment.body}\n${visibleAppointment.next}`,
  );
  const hasNext = appointment.hasNext || appointment.next.trim().length > 0;
  const editBlockId = isNew ? "new-appointment" : `appointment-${index}`;
  const editBlockLabel = isNew
    ? "Cita nueva"
    : `Cita ${index + 1} - ${appointment.dateText || "Sin fecha"}`;
  const noShowButton =
    !isEditing && !isNew && !hasNoShow && !isNextEditing ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={historyNoShowButtonClass}
        disabled={disabled || isDeleting}
        onClick={() => {
          setDraft(markTextHistoryAppointmentNoShow(appointment));
          setIsEditing(true);
        }}
      >
        <X className="size-4" aria-hidden="true" />
        NO ASISTIÓ
      </Button>
    ) : null;

  useEffect(() => {
    if (isNew) {
      setIsEditing(true);
      setDraft(appointment);
      return;
    }

    if (!isEditing) {
      setDraft(appointment);
      setIsConfirmingDelete(false);
    }
  }, [appointment, isEditing, isNew]);

  useEffect(() => {
    onEditingChange({ id: editBlockId, label: editBlockLabel }, isEditing);

    return () => {
      onEditingChange({ id: editBlockId, label: editBlockLabel }, false);
    };
  }, [editBlockId, editBlockLabel, isEditing, onEditingChange]);

  const updateDraft = useCallback(
    (patch: Partial<ParsedTextHistoryAppointment>) => {
      setDraft((current) =>
        normalizeTextHistoryAppointment({ ...current, ...patch }),
      );
    },
    [],
  );

  const cancelEditing = useCallback(() => {
    setDraft(appointment);
    setIsEditing(false);
    onCancelNew?.();
  }, [appointment, onCancelNew]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const saved = await onSave(normalizeTextHistoryAppointment(draft));
    setIsSaving(false);

    if (saved) {
      setIsEditing(false);
    }
  }, [draft, onSave]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const deleted = await onDelete();
    setIsDeleting(false);

    if (deleted) {
      setIsConfirmingDelete(false);
    }
  }, [onDelete]);

  return (
    <>
      <article
        id={isNew ? undefined : `cita-${entryId}-${index}`}
        className={cn(
          "grid gap-3 scroll-mt-24 rounded-lg border bg-lavender-950/18 p-3 md:grid-cols-[9.5rem_minmax(0,1fr)]",
          hasNoShow ? "border-coral-400/35" : "border-lavender-500/25",
        )}
      >
        <div className="space-y-2">
          <label
            htmlFor={dateId}
            className="block text-[0.68rem] font-semibold uppercase tracking-wide text-lavender-200/45"
          >
            Cita {index + 1}
          </label>
          {isEditing ? (
            <Input
              id={dateId}
              aria-label={`Fecha de cita ${index + 1}`}
              value={draft.dateText}
              onChange={(event) =>
                updateDraft({ dateText: event.target.value })
              }
              className="font-mono font-semibold"
              disabled={disabled || isSaving}
            />
          ) : (
            <p className="rounded-md border border-brand-300/35 bg-brand-900/45 px-3 py-2 text-sm font-semibold text-white">
              <HighlightedHistoryText
                text={appointment.dateText}
                query={searchQuery}
              />
            </p>
          )}
          <p className="text-xs text-lavender-200/45">
            <HighlightedHistoryText
              text={visibleAppointment.normalizedDate ?? "Fecha sin normalizar"}
              query={searchQuery}
            />
          </p>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {hasNoShow ? <Badge tone="coral">No asistió</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BlockActions
                isEditing={isEditing}
                isSaving={isSaving}
                disabled={disabled || isDeleting}
                onEdit={() => setIsEditing(true)}
                onCancel={cancelEditing}
                onSave={handleSave}
              />
              {!isEditing && !isNew ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={historyDeleteButtonClass}
                  disabled={disabled || isDeleting}
                  onClick={() => setIsConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Eliminar
                </Button>
              ) : null}
            </div>
          </div>

          {isEditing ? (
            <Textarea
              id={bodyId}
              value={draft.body}
              onChange={(event) => updateDraft({ body: event.target.value })}
              className="min-h-28 font-mono text-sm leading-6"
              placeholder="Notas de la cita"
              disabled={disabled || isSaving}
              autoFocus={isNew}
            />
          ) : hasBody ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-lavender-100/72">
              <HighlightedHistoryText
                text={appointment.body}
                query={searchQuery}
              />
            </p>
          ) : (
            <p className="rounded-md border border-dashed border-lavender-500/25 px-3 py-2 text-sm text-lavender-200/45">
              Cita sin notas
            </p>
          )}

          {hasNext ? (
            <>
              <LinkedTextNextBlock
                appointmentIndex={index}
                anchorId={isNew ? undefined : `cita-${entryId}-${index}-next`}
                next={appointment.next}
                hasNext={hasNext}
                disabled={disabled}
                searchQuery={searchQuery}
                onEditingChange={onEditingChange}
                onLocalEditingChange={setIsNextEditing}
                onSave={onSaveNext}
                onDelete={onDeleteNext}
                isNew={isNew}
                onNextTextChange={(text) =>
                  updateDraft({ next: text })
                }
              />
              {noShowButton ? (
                <div className="flex flex-wrap items-center gap-2">
                  {noShowButton}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {noShowButton}
              <div className={cn(isNextEditing ? "w-full" : "w-fit")}>
                <LinkedTextNextBlock
                  appointmentIndex={index}
                  anchorId={isNew ? undefined : `cita-${entryId}-${index}-next`}
                  next={appointment.next}
                  hasNext={hasNext}
                  disabled={disabled}
                  searchQuery={searchQuery}
                  onEditingChange={onEditingChange}
                  onLocalEditingChange={setIsNextEditing}
                  onSave={onSaveNext}
                  onDelete={onDeleteNext}
                  isNew={isNew}
                  onNextTextChange={(text) =>
                    updateDraft({ next: text })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </article>

      <ConfirmDeleteModal
        open={isConfirmingDelete}
        title="¿Estás seguro que quieres ELIMINAR?"
        description="Se eliminará esta cita de la historia vinculada"
        itemLabel={`Cita ${index + 1} · ${appointment.dateText || "Sin fecha"}`}
        isDeleting={isDeleting}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function LinkedTextNextBlock({
  appointmentIndex,
  anchorId,
  next,
  hasNext,
  disabled,
  searchQuery,
  onEditingChange,
  onLocalEditingChange,
  onSave,
  onDelete,
  isNew,
  onNextTextChange,
}: {
  appointmentIndex: number;
  anchorId?: string;
  next: string;
  hasNext: boolean;
  disabled: boolean;
  searchQuery: string;
  onEditingChange: HistoryEditingChange;
  onLocalEditingChange?: (isEditing: boolean) => void;
  onSave: (next: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  isNew?: boolean;
  onNextTextChange?: (next: string) => void;
}) {
  const nextId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(next);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(next);
      setIsConfirmingDelete(false);
    }
  }, [isEditing, next]);

  useEffect(() => {
    const block = {
      id: `next-${appointmentIndex}`,
      label: `NEXT de cita ${appointmentIndex + 1}`,
    };

    onEditingChange(block, isEditing);
    onLocalEditingChange?.(isEditing);

    return () => {
      onEditingChange(block, false);
      onLocalEditingChange?.(false);
    };
  }, [appointmentIndex, isEditing, onEditingChange, onLocalEditingChange]);

  const cancelEditing = useCallback(() => {
    setDraft(next);
    setIsEditing(false);
    onLocalEditingChange?.(false);
    onNextTextChange?.(next);
  }, [next, onLocalEditingChange, onNextTextChange]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const saved = await onSave(draft);
    setIsSaving(false);

    if (saved) {
      setIsEditing(false);
      onLocalEditingChange?.(false);
    }
  }, [draft, onLocalEditingChange, onSave]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const deleted = await onDelete();
    setIsDeleting(false);

    if (deleted) {
      setIsConfirmingDelete(false);
    }
  }, [onDelete]);

  if (!hasNext && !isEditing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit text-amber-200/80 hover:bg-amber-950/25 hover:text-amber-100"
        disabled={disabled}
        onClick={() => {
          setDraft("");
          onLocalEditingChange?.(true);
          setIsEditing(true);
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar NEXT
      </Button>
    );
  }

  return (
    <>
      <div
        id={anchorId}
        tabIndex={anchorId ? -1 : undefined}
        className="w-full scroll-mt-24 rounded-md border border-amber-400/25 bg-amber-950/20 p-3 focus-visible:outline-2 focus-visible:outline-amber-200/70"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={nextId}
            className="text-xs font-semibold uppercase tracking-wide text-amber-300/80"
          >
            NEXT
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <BlockActions
              isEditing={isEditing}
              isSaving={isSaving}
              disabled={disabled || isDeleting}
              isNew={isNew}
              onEdit={() => {
                onLocalEditingChange?.(true);
                setIsEditing(true);
              }}
              onCancel={cancelEditing}
              onSave={handleSave}
            />
            {!isEditing && hasNext ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={historyDeleteButtonClass}
                disabled={disabled || isDeleting}
                onClick={() => setIsConfirmingDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Eliminar
              </Button>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <Textarea
            id={nextId}
            value={draft}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              onNextTextChange?.(value);
            }}
            className="min-h-20 font-mono text-sm leading-6"
            placeholder="Pendiente de la siguiente cita"
            disabled={disabled || isSaving}
          />
        ) : next.trim().length > 0 ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-lavender-100/72">
            <HighlightedHistoryText text={next} query={searchQuery} />
          </p>
        ) : (
          <p className="text-sm text-lavender-200/45">
            NEXT sin notas en cita {appointmentIndex + 1}
          </p>
        )}
      </div>

      <ConfirmDeleteModal
        open={isConfirmingDelete}
        title="Eliminar NEXT"
        description="Se eliminará este bloque NEXT y se guardará un respaldo del bloque."
        itemLabel={`NEXT de cita ${appointmentIndex + 1}`}
        isDeleting={isDeleting}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function HighlightedHistoryText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const segments = useMemo(
    () => getTextHistoryHighlightSegments(text, query),
    [query, text],
  );

  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={`${segment.text}-${index}`}
            className="rounded-[3px] bg-amber-300/25 px-0.5 text-amber-100 ring-1 ring-amber-200/20"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function BlockActions({
  isEditing,
  isSaving,
  disabled,
  isNew,
  onEdit,
  onCancel,
  onSave,
}: {
  isEditing: boolean;
  isSaving: boolean;
  disabled: boolean;
  isNew?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
}) {
  if (!isEditing) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={historyEditButtonClass}
        onClick={onEdit}
        disabled={disabled}
      >
        <Pencil className="size-4" aria-hidden="true" />
        Editar
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={historyCancelButtonClass}
        onClick={onCancel}
        disabled={disabled || isSaving}
      >
        Cancelar
      </Button>
      {!isNew && (
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={disabled || isSaving}
        >
          {isSaving ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {isSaving ? "Guardando..." : "Guardar"}
        </Button>
      )}
    </div>
  );
}

function PatientPhotoViewer({
  patientName,
  photos,
  currentIndex,
  onClose,
  onNavigate,
}: {
  patientName: string;
  photos: SerializedAttachment[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const titleId = useId();
  const currentPhoto = photos[currentIndex];
  const [isOriginalLoading, setIsOriginalLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const hasMultiplePhotos = photos.length > 1;
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < photos.length - 1;

  const goToPrevious = useCallback(() => {
    if (!canGoPrevious) return;
    onNavigate(currentIndex - 1);
  }, [canGoPrevious, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (!canGoNext) return;
    onNavigate(currentIndex + 1);
  }, [canGoNext, currentIndex, onNavigate]);

  useEffect(() => {
    setIsOriginalLoading(true);
    setIsZoomed(false);
    setZoomPosition({ x: 50, y: 50 });
  }, [currentPhoto.id]);

  const updateZoomPosition = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;

      const rect = event.currentTarget.getBoundingClientRect();
      const nextX = clamp(
        ((event.clientX - rect.left) / rect.width) * 100,
        0,
        100,
      );
      const nextY = clamp(
        ((event.clientY - rect.top) / rect.height) * 100,
        0,
        100,
      );

      setZoomPosition({ x: nextX, y: nextY });
    },
    [],
  );

  const handleImagePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isZoomed) return;
      updateZoomPosition(event);
    },
    [isZoomed, updateZoomPosition],
  );

  const handleImagePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;

      updateZoomPosition(event);
      setIsZoomed((current) => !current);
    },
    [updateZoomPosition],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        goToPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        goToNext();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToNext, goToPrevious, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/72 backdrop-blur-xl"
        aria-label="Cerrar imagen"
        onClick={onClose}
      />

      <section className="relative z-10 grid h-full w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-lavender-200/20 bg-lavender-950/22 p-2 shadow-[0_28px_90px_rgba(0,0,0,0.58)] ring-1 ring-white/5 sm:p-3">
        <div className="grid gap-3 rounded-lg border border-lavender-500/30 bg-ink-950 px-3 py-2 shadow-panel backdrop-blur-md sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:px-4">
          <div className="min-w-0 sm:order-1">
            <p className="truncate text-sm font-semibold text-white">
              {currentPhoto.originalName}
            </p>
          </div>
          <div className="min-w-0 text-center sm:order-2">
            <h2
              id={titleId}
              className="truncate text-sm font-semibold text-white sm:text-base"
            >
              {patientName}
            </h2>
            <p className="text-xs text-lavender-200/60">
              {currentPhoto.capturedAt
                ? `Capturada ${formatDateOnly(currentPhoto.capturedAt)}`
                : "Sin fecha de captura"}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 sm:order-3">
            <p
              className="text-sm font-semibold text-white sm:text-base"
              aria-label={`Imagen ${currentIndex + 1} de ${photos.length}`}
            >
              {currentIndex + 1} / {photos.length}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-11 border-coral-400/55 bg-coral-900/60 text-coral-400 backdrop-blur-md hover:bg-coral-500 hover:text-white"
              aria-label="Cerrar imagen"
              onClick={onClose}
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "relative min-h-0 overflow-hidden rounded-lg bg-ink-950 shadow-2xl shadow-ink-950/60",
            isZoomed ? "cursor-zoom-out" : "cursor-zoom-in",
          )}
          onPointerMove={handleImagePointerMove}
          onPointerUp={handleImagePointerUp}
        >
          {isOriginalLoading ? (
            <div
              className="image-preview-skeleton absolute inset-0"
              aria-hidden="true"
            />
          ) : null}
          <Image
            key={currentPhoto.id}
            src={`/api/files/${currentPhoto.id}`}
            alt={currentPhoto.originalName}
            fill
            sizes="100vw"
            className={cn(
              "object-contain transition-[opacity,transform] duration-300 ease-out",
              isZoomed ? "scale-[2.5]" : "scale-100",
              isOriginalLoading ? "opacity-0" : "opacity-100",
            )}
            style={{ transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%` }}
            priority
            unoptimized
            onLoad={() => setIsOriginalLoading(false)}
            onError={() => setIsOriginalLoading(false)}
          />

          {isZoomed ? (
            <div
              className="pointer-events-none absolute left-3 top-3 rounded-md border border-lavender-100/25 bg-lavender-950/75 px-2.5 py-1 text-xs font-medium text-lavender-50 shadow-panel backdrop-blur-md"
              aria-hidden="true"
            >
              Zoom 2.5x
            </div>
          ) : null}

          {hasMultiplePhotos ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-3 top-1/2 size-11 -translate-y-1/2 bg-lavender-950/70 backdrop-blur-md sm:left-4"
                aria-label="Imagen anterior"
                onClick={goToPrevious}
                onPointerUp={(event) => event.stopPropagation()}
                disabled={!canGoPrevious}
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-3 top-1/2 size-11 -translate-y-1/2 bg-lavender-950/70 backdrop-blur-md sm:right-4"
                aria-label="Imagen siguiente"
                onClick={goToNext}
                onPointerUp={(event) => event.stopPropagation()}
                disabled={!canGoNext}
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PaymentHistoryPanel({
  patientId,
  sheet,
  missing = false,
  featured = false,
}: {
  patientId: string;
  sheet: SerializedPatientDetail["paymentHistorySheets"][number];
  missing?: boolean;
  featured?: boolean;
}) {
  const [editingFolder, setEditingFolder] = useState<{
    sheetId: string;
    originalFolderId: string;
    value: string;
  } | null>(null);
  const [confirmFolderEditOpen, setConfirmFolderEditOpen] = useState(false);
  const storedFolderId = sheet.googleFolderId ?? "";
  const hasGoogleFolderId = Boolean(sheet.googleFolderId);
  const isEditingCurrentFolder =
    editingFolder?.sheetId === sheet.id && editingFolder.originalFolderId === storedFolderId;
  const isFolderEditable =
    !hasGoogleFolderId ||
    isEditingCurrentFolder;
  const folderInputValue = isEditingCurrentFolder ? editingFolder.value : storedFolderId;
  const uploadIsInProgress = isPaymentHistoryUploadInProgress(sheet.uploadStartedAt);
  const folderWasChanged = folderInputValue.trim() !== storedFolderId.trim();
  const canRetryUpload = Boolean(folderInputValue.trim()) && !uploadIsInProgress &&
    (folderWasChanged || sheet.uploadStatus !== "UPLOADED");

  function cancelFolderEdit() {
    setEditingFolder(null);
  }

  return (
    <div className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {sheet.isActive ? <Badge tone="brand">Activo</Badge> : null}
            <PaymentHistoryStatusBadge
              status={sheet.uploadStatus}
              uploadStartedAt={sheet.uploadStartedAt}
            />
            {missing ? <Badge tone="coral">Faltante</Badge> : null}
          </div>
          <p className="truncate font-medium text-ink-100">
            {sheet.attachment.originalName}
          </p>
          <p className="truncate text-sm text-lavender-200/55">
            {sheet.attachment.sourceRelativePath}
          </p>
          <p className="text-xs text-lavender-200/45">
            Importado {formatDate(sheet.createdAt)}
            {sheet.uploadedAt
              ? ` · Subido ${formatDate(sheet.uploadedAt)}`
              : ""}
          </p>
          {sheet.errorMessage ? (
            <p className="text-sm text-coral-300">{sheet.errorMessage}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {sheet.googleUrl ? (
            <Button asChild
              className={cn(
                buttonVariants({ variant: "secondary", size: "md" }),
                "min-w-32 border-emerald-300/45 bg-emerald-700/70 px-5 text-white shadow-sm shadow-emerald-950/30 hover:border-emerald-200/70 hover:bg-emerald-600"
              )}>
              <Link href={sheet.googleUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Abrir en Google Sheets
              </Link>
            </Button>
          ) : null}
          {missing ? (
            <Button type="button" variant="secondary" size="md" disabled>
              <FileText className="size-4" aria-hidden="true" />
              Abrir local
            </Button>
          ) : (
            <Button asChild variant="secondary" size="md">
              <Link href={`/api/files/${sheet.attachment.id}`} target="_blank">
                <FileText className="size-4" aria-hidden="true" />
                Abrir local
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <form
          action={retryPaymentHistorySheetUpload}
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <input type="hidden" name="sheetId" value={sheet.id} />
          <div className="flex min-w-0 gap-2">
            <Input
              name="googleFolderId"
              value={folderInputValue}
              onChange={(event) =>
                setEditingFolder({
                  sheetId: sheet.id,
                  originalFolderId: storedFolderId,
                  value: event.currentTarget.value,
                })
              }
              placeholder="Link o ID de carpeta compartida de Google Drive"
              readOnly={!isFolderEditable}
              className="min-w-0 flex-1 read-only:cursor-default read-only:bg-lavender-950/45"
              aria-label="Carpeta de destino del historial de Google Sheets"
            />
            {hasGoogleFolderId ? (
              isFolderEditable ? (
                <Button type="button" variant="danger" size="md" onClick={cancelFolderEdit}>
                  Cancelar edición
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setConfirmFolderEditOpen(true)}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Modificar
                </Button>
              )
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  tabIndex={canRetryUpload ? undefined : 0}
                  aria-label={canRetryUpload ? undefined : uploadIsInProgress
                    ? "La subida de este historial está en curso"
                    : "Modifica la liga o conecta Google para habilitar Subir/Reintentar"}
                  className="inline-flex rounded-md"
                >
                  <PaymentHistoryUploadSubmitButton
                    disabled={!canRetryUpload}
                    uploadIsInProgress={uploadIsInProgress}
                  />
                </span>
              }
            />
            <TooltipContent>
              {canRetryUpload
                ? "Puedes subir/reintentar en la carpeta indicada."
                : uploadIsInProgress
                  ? "La subida de este historial ya está en curso."
                  : sheet.uploadStatus === "UPLOADED" && !folderWasChanged
                    ? "Para subir a otra carpeta, primero modifica la liga."
                    : "No hay una carpeta de Drive válida para subir este historial."}
            </TooltipContent>
          </Tooltip>
        </form>

        <Dialog open={confirmFolderEditOpen} onOpenChange={setConfirmFolderEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>¿Seguro que quieres modificar la liga?</DialogTitle>
              <DialogDescription>
                Al confirmar se habilitará el campo. El nuevo destino se aplicará al pulsar
                “Subir/Reintentar”, lo que creará una hoja en la carpeta indicada. La hoja actual
                permanecerá en Google Drive.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button type="button" variant="secondary" onClick={() => setConfirmFolderEditOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setEditingFolder({
                    sheetId: sheet.id,
                    originalFolderId: storedFolderId,
                    value: storedFolderId,
                  });
                  setConfirmFolderEditOpen(false);
                }}
              >
                Sí, modificar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!sheet.isActive && !featured ? (
          <form action={setActivePaymentHistorySheet}>
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="sheetId" value={sheet.id} />
            <Button type="submit" variant="ghost" size="sm">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Usar como activo
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function PaymentHistoryStatusBadge({
  status,
  uploadStartedAt,
}: {
  status: SerializedPatientDetail["paymentHistorySheets"][number]["uploadStatus"];
  uploadStartedAt: string | null;
}) {
  if (status === "UPLOADING" && isPaymentHistoryUploadInProgress(uploadStartedAt)) {
    return (
      <Badge tone="brand">
        <LoaderCircle className="mr-1 size-3 animate-spin" aria-hidden="true" />
        Subiendo
      </Badge>
    );
  }

  if (status === "UPLOADED") {
    return (
      <Badge tone="green">
        <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
        Google Sheets
      </Badge>
    );
  }

  if (status === "FAILED") {
    return <Badge tone="coral">Falló subida</Badge>;
  }

  if (status === "UPLOADING") {
    return <Badge tone="coral">Reintento disponible</Badge>;
  }

  return (
    <Badge tone="neutral">
      <LoaderCircle className="mr-1 size-3" aria-hidden="true" />
      Local solamente
    </Badge>
  );
}

function PaymentHistoryUploadSubmitButton({
  disabled,
  uploadIsInProgress,
}: {
  disabled: boolean;
  uploadIsInProgress: boolean;
}) {
  const { pending } = useFormStatus();
  const isBusy = pending || uploadIsInProgress;

  return (
    <Button type="submit" variant="secondary" size="md" disabled={disabled || pending}>
      {isBusy ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <UploadCloud className="size-4" aria-hidden="true" />
      )}
      {isBusy ? "Subiendo…" : "Subir/Reintentar"}
    </Button>
  );
}

function Tab({
  value,
  label,
  icon: Icon,
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

function AttachmentTile({
  attachment,
  patientId,
  profilePhotoId,
  missing = false,
  priority = false,
  onPreviewSettled,
  onOpen,
}: {
  attachment: SerializedAttachment;
  patientId: string;
  profilePhotoId: string | null;
  missing?: boolean;
  priority?: boolean;
  onPreviewSettled?: (attachmentId: string) => void;
  onOpen?: () => void;
}) {
  const isImage = isPreviewableAttachment(attachment, missing);
  const [isPreviewLoading, setIsPreviewLoading] = useState(isImage);
  const [isSettingProfile, startSettingProfileTransition] = useTransition();
  const previewSettledRef = useRef(false);
  const isProfilePhoto = profilePhotoId === attachment.id;

  useEffect(() => {
    previewSettledRef.current = false;
    setIsPreviewLoading(isImage);
  }, [attachment.id, isImage]);

  const markPreviewSettled = useCallback(() => {
    if (previewSettledRef.current) return;
    previewSettledRef.current = true;
    setIsPreviewLoading(false);
    onPreviewSettled?.(attachment.id);
  }, [attachment.id, onPreviewSettled]);

  const handleSetProfilePhoto = useCallback(async () => {
    startSettingProfileTransition(async () => {
      try {
        await setPatientProfilePhoto({
          patientId,
          attachmentId: attachment.id,
        });
      } catch {
        // Ignorar errores
      }
    });
  }, [patientId, attachment.id]);

  const preview = (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-lavender-950/45">
      {isImage ? (
        <>
          {isPreviewLoading ? (
            <div
              className="image-preview-skeleton absolute inset-0"
              aria-hidden="true"
            />
          ) : null}
          <Image
            src={`/api/files/${attachment.id}/preview?w=520`}
            alt={attachment.originalName}
            width={640}
            height={480}
            sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1280px) calc((100vw - 5rem) / 2), 420px"
            className={cn(
              "h-full w-full object-cover transition duration-500",
              isPreviewLoading
                ? "scale-[1.02] opacity-0"
                : "scale-100 opacity-100",
            )}
            decoding="async"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            unoptimized
            onLoad={markPreviewSettled}
            onError={markPreviewSettled}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/0 opacity-0 transition group-hover:bg-ink-950/32 group-hover:opacity-100 group-focus-visible:bg-ink-950/32 group-focus-visible:opacity-100">
            <span className="inline-flex size-11 items-center justify-center rounded-full border border-lavender-100/40 bg-lavender-950/70 text-lavender-50 shadow-panel backdrop-blur-sm">
              <Maximize2 className="size-5" aria-hidden="true" />
            </span>
          </div>
        </>
      ) : (
        <FileText className="size-12 text-lavender-500/55" aria-hidden="true" />
      )}
    </div>
  );
  const details = (
    <div className="space-y-2 p-4" onClick={(e) => e.stopPropagation()}>
      {missing ? <Badge tone="coral">Faltante</Badge> : null}
      <div className="flex items-center gap-2">
        {isProfilePhoto ? (
          <Badge className="whitespace-nowrap" tone="brand">Foto de perfil</Badge>
        ) : null}
        <p className="truncate text-sm font-medium text-ink-100">
          {attachment.originalName}
        </p>
      </div>
      <p className="text-xs text-lavender-200/55">
        {attachment.capturedAt
          ? `Capturada ${formatDateOnly(attachment.capturedAt)}`
          : "Sin fecha de captura"}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={cn(
          isProfilePhoto
            ? "border-emerald-300/45 bg-emerald-700/60 text-white"
            : "text-lavender-200 hover:text-white",
          "h-7 text-xs",
        )}
        disabled={isProfilePhoto || isSettingProfile}
        onClick={handleSetProfilePhoto}
      >
        {isSettingProfile ? (
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
        ) : isProfilePhoto ? (
          <CheckCircle2 className="size-3" aria-hidden="true" />
        ) : (
          <UserCircle2 className="size-3" aria-hidden="true" />
        )}
        {isProfilePhoto ? "Foto de perfil activa" : "Elegir como foto de perfil"}
      </Button>
    </div>
  );

  return (
    <Card className="overflow-hidden p-0">
      {isImage && onOpen ? (
        <div
          role="button"
          tabIndex={0}
          className="group block w-full text-left outline-none transition focus-visible:ring-2 focus-visible:ring-lavender-200/65"
          aria-label={`Abrir ${attachment.originalName} en tamaño completo`}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen();
            }
          }}
        >
          {preview}
          {details}
        </div>
      ) : (
        <>
          {preview}
          {details}
        </>
      )}
    </Card>
  );
}

function LedgerList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    amount: string;
  }>;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-lavender-600/45 bg-lavender-950/25 px-4 py-3 text-sm font-medium text-lavender-100">
        {title}
      </div>
      {rows.length > 0 ? (
        rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 border-b border-lavender-600/45 px-4 py-3 transition last:border-0 hover:bg-lavender-800/25"
          >
            <div>
              <p className="text-sm font-medium text-ink-100">{row.primary}</p>
              <p className="text-xs text-lavender-200/55">{row.secondary}</p>
            </div>
            <p className="text-sm font-semibold text-white">{row.amount}</p>
          </div>
        ))
      ) : (
        <p className="px-4 py-6 text-sm text-lavender-200/55">
          Sin movimientos
        </p>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="surface p-6 text-sm text-lavender-200/60">{text}</div>;
}

function isPreviewableAttachment(
  attachment: SerializedAttachment,
  missing: boolean | Set<string>,
) {
  const isMissing =
    missing instanceof Set ? missing.has(attachment.id) : missing;

  return Boolean(attachment.mimeType?.startsWith("image/") && !isMissing);
}

function getLinkedTextAttachment(
  entry: SerializedPatientDetail["clinicalEntries"][number],
) {
  return entry.attachments.find((attachment) =>
    isPlainTextAttachment(attachment.originalName, attachment.mimeType),
  );
}

function splitAttachmentSourcePath(
  sourceRelativePath: string,
  fallbackFileName: string,
) {
  const segments = sourceRelativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  return {
    folderName: segments.length > 1 ? segments[0] : "",
    fileName: segments[segments.length - 1] ?? fallbackFileName,
  };
}

function formatDateOnly(value: string) {
  return formatDate(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
