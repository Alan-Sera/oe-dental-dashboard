"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent
} from "react";
import Image from "next/image";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  Maximize2,
  NotebookPen,
  Plus,
  Table2,
  UploadCloud,
  X
} from "lucide-react";

import { categoryLabels } from "@/constants";
import type { SerializedAttachment, SerializedPatientDetail } from "@/types";
import {
  retryPaymentHistorySheetUpload,
  setActivePaymentHistorySheet
} from "@/lib/actions/payment-history.actions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useGlobalLoading } from "@/components/loading-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClinicalEntryForm } from "@/components/forms/clinical-entry-form";
import { PaymentForm, TreatmentChargeForm } from "@/components/forms/ledger-forms";
import { PatientForm } from "@/components/forms/patient-form";

export function PatientDetailTabs({
  patient,
  missingAttachmentIds = []
}: {
  patient: SerializedPatientDetail;
  missingAttachmentIds?: string[];
}) {
  const [activeTab, setActiveTab] = useState("summary");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [pendingInitialImageIds, setPendingInitialImageIds] = useState<Set<string>>(
    () => new Set()
  );
  const { show: showLoading, hide: hideLoading } = useGlobalLoading();
  const mediaLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaOverlayVisibleRef = useRef(false);
  const photos = useMemo(
    () =>
      patient.attachments.filter((attachment) =>
        ["PHOTO", "RADIOGRAPH"].includes(attachment.category)
      ),
    [patient.attachments]
  );
  const activePaymentHistory = patient.paymentHistorySheets.find((sheet) => sheet.isActive);
  const missingAttachmentIdSet = useMemo(
    () => new Set(missingAttachmentIds),
    [missingAttachmentIds]
  );
  const initialMediaImageIds = useMemo(
    () =>
      photos
        .filter((attachment) => isPreviewableAttachment(attachment, missingAttachmentIdSet))
        .slice(0, 6)
        .map((attachment) => attachment.id),
    [missingAttachmentIdSet, photos]
  );
  const viewablePhotos = useMemo(
    () => photos.filter((attachment) => isPreviewableAttachment(attachment, missingAttachmentIdSet)),
    [missingAttachmentIdSet, photos]
  );
  const selectedPhotoIndex = selectedPhotoId
    ? viewablePhotos.findIndex((photo) => photo.id === selectedPhotoId)
    : -1;
  const missingCount = missingAttachmentIds.length;

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
    [startMediaLoading, stopMediaLoading]
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
      <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="space-y-5">
        <Tabs.List className="flex gap-2 overflow-x-auto rounded-lg border border-lavender-600/55 bg-lavender-900/35 p-1">
          <Tab value="summary" icon={FileText} label="Resumen" />
          <Tab value="media" icon={ImageIcon} label="Fotos" />
          <Tab value="clinical" icon={NotebookPen} label="Historia" />
          <Tab value="ledger" icon={BadgeDollarSign} label="Cuenta" />
          <Tab value="payment-history" icon={Table2} label="Historial pagos" />
          <Tab value="files" icon={FolderOpen} label="Archivos" />
        </Tabs.List>

      {missingCount > 0 ? (
        <div className="surface flex gap-3 p-4 text-sm text-coral-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{missingCount} archivo(s) vinculado(s) no existen en la ruta configurada.</p>
        </div>
      ) : null}

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
                birthDate: patient.birthDate?.slice(0, 10) ?? "",
                gender: patient.gender ?? "",
                nextAppointmentDate: patient.nextAppointmentDate?.slice(0, 10) ?? "",
                notes: patient.notes ?? ""
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
                  <p className="text-sm text-lavender-200/55">Citas del paciente</p>
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" className="w-full" disabled>
                <Plus className="size-4" aria-hidden="true" />
                Nueva Cita
              </Button>
            </div>
            <div className="rounded-md border border-dashed border-lavender-500/45 px-4 py-8 text-center">
              <p className="text-sm font-medium text-lavender-100">Sin asistencias registradas</p>
              <p className="mt-1 text-sm text-lavender-200/50">
                Aquí aparecerán las citas cuando se agregue el módulo de agenda.
              </p>
            </div>
          </Card>
        </div>
      </Tabs.Content>

      <Tabs.Content value="media" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {photos.length > 0 ? (
          photos.map((attachment, index) => (
            <AttachmentTile
              key={attachment.id}
              attachment={attachment}
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

      <Tabs.Content value="payment-history" className="space-y-5">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title">Historial de pagos activo</h2>
              <p className="mt-1 text-sm text-lavender-200/60">
                Archivo local importado y, cuando esté conectado, convertido a Google Sheets.
              </p>
            </div>
            {activePaymentHistory ? <PaymentHistoryStatusBadge status={activePaymentHistory.uploadStatus} /> : null}
          </div>

          {activePaymentHistory ? (
            <PaymentHistoryPanel
              patientId={patient.id}
              sheet={activePaymentHistory}
              missing={missingAttachmentIdSet.has(activePaymentHistory.attachment.id)}
              featured
            />
          ) : (
            <EmptyState text="Sin historial activo. Importa un .xlsx o elige uno de la lista como historial activo." />
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">Historiales importados</h2>
            <Badge tone="neutral">{patient.paymentHistorySheets.length} archivo(s)</Badge>
          </div>

          {patient.paymentHistorySheets.length > 0 ? (
            <div className="space-y-3">
              {patient.paymentHistorySheets.map((sheet) => (
                <PaymentHistoryPanel
                  key={sheet.id}
                  patientId={patient.id}
                  sheet={sheet}
                  missing={missingAttachmentIdSet.has(sheet.attachment.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState text="Aún no hay archivos .xlsx de historial de pagos para este paciente" />
          )}
        </Card>
      </Tabs.Content>

      <Tabs.Content value="files" className="space-y-3">
        {patient.attachments.length > 0 ? (
          patient.attachments.map((attachment) => {
            const missing = missingAttachmentIdSet.has(attachment.id);

            return (
              <Card key={attachment.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-100">{attachment.originalName}</p>
                  <p className="text-sm text-lavender-200/55">{attachment.sourceRelativePath}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{categoryLabels[attachment.category]}</Badge>
                  {missing ? <Badge tone="coral">Faltante</Badge> : null}
                  {missing ? (
                    <span className="text-sm text-lavender-200/35">No disponible</span>
                  ) : (
                    <Link href={`/api/files/${attachment.id}`} target="_blank" className="text-sm text-lavender-200 hover:text-white">
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
          onNavigate={(nextIndex) => setSelectedPhotoId(viewablePhotos[nextIndex]?.id ?? null)}
        />
      ) : null}
    </>
  );
}

function PatientPhotoViewer({
  patientName,
  photos,
  currentIndex,
  onClose,
  onNavigate
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

  const updateZoomPosition = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const nextX = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const nextY = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    setZoomPosition({ x: nextX, y: nextY });
  }, []);

  const handleImagePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isZoomed) return;
      updateZoomPosition(event);
    },
    [isZoomed, updateZoomPosition]
  );

  const handleImagePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;

      updateZoomPosition(event);
      setIsZoomed((current) => !current);
    },
    [updateZoomPosition]
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
        className="absolute inset-0 bg-ink-950/88 backdrop-blur-md"
        aria-label="Cerrar imagen"
        onClick={onClose}
      />

      <section className="relative z-10 grid h-full w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-3">
        <div className="grid gap-3 rounded-lg border border-lavender-500/30 bg-lavender-950/72 px-3 py-2 shadow-panel backdrop-blur-md sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:px-4">
          <div className="min-w-0 sm:order-1">
            <p className="truncate text-sm font-semibold text-white">
              {currentPhoto.originalName}
            </p>
          </div>
          <div className="min-w-0 text-center sm:order-2">
            <h2 id={titleId} className="truncate text-sm font-semibold text-white sm:text-base">
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
              className="size-11 bg-lavender-950/70 backdrop-blur-md"
              aria-label="Cerrar imagen"
              onClick={onClose}
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "relative min-h-0 overflow-hidden rounded-lg border border-lavender-500/25 bg-ink-950/76 shadow-2xl shadow-ink-950/60",
            isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
          )}
          onPointerMove={handleImagePointerMove}
          onPointerUp={handleImagePointerUp}
        >
          {isOriginalLoading ? (
            <div className="image-preview-skeleton absolute inset-0" aria-hidden="true" />
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
              isOriginalLoading ? "opacity-0" : "opacity-100"
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
  featured = false
}: {
  patientId: string;
  sheet: SerializedPatientDetail["paymentHistorySheets"][number];
  missing?: boolean;
  featured?: boolean;
}) {
  return (
    <div className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {sheet.isActive ? <Badge tone="brand">Activo</Badge> : null}
            <PaymentHistoryStatusBadge status={sheet.uploadStatus} />
            {missing ? <Badge tone="coral">Faltante</Badge> : null}
          </div>
          <p className="truncate font-medium text-ink-100">{sheet.attachment.originalName}</p>
          <p className="truncate text-sm text-lavender-200/55">{sheet.attachment.sourceRelativePath}</p>
          <p className="text-xs text-lavender-200/45">
            Importado {formatDate(sheet.createdAt)}
            {sheet.uploadedAt ? ` · Subido ${formatDate(sheet.uploadedAt)}` : ""}
          </p>
          {sheet.errorMessage ? <p className="text-sm text-coral-300">{sheet.errorMessage}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {sheet.googleUrl ? (
            <Button asChild size="sm">
              <Link href={sheet.googleUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Abrir en Google Sheets
              </Link>
            </Button>
          ) : null}
          {missing ? (
            <Button type="button" variant="secondary" size="sm" disabled>
              <FileText className="size-4" aria-hidden="true" />
              Abrir local
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/api/files/${sheet.attachment.id}`} target="_blank">
                <FileText className="size-4" aria-hidden="true" />
                Abrir local
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <form action={retryPaymentHistorySheetUpload} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="sheetId" value={sheet.id} />
          <Input
            name="googleFolderId"
            defaultValue={sheet.googleFolderId ?? ""}
            placeholder="Link o ID de carpeta compartida de Google Drive"
          />
          <Button type="submit" variant="secondary" size="sm">
            <UploadCloud className="size-4" aria-hidden="true" />
            Subir/Reintentar
          </Button>
        </form>

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
  status
}: {
  status: SerializedPatientDetail["paymentHistorySheets"][number]["uploadStatus"];
}) {
  if (status === "UPLOADED") {
    return (
      <Badge tone="brand">
        <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
        Google Sheets
      </Badge>
    );
  }

  if (status === "FAILED") {
    return <Badge tone="coral">Falló subida</Badge>;
  }

  return (
    <Badge tone="neutral">
      <LoaderCircle className="mr-1 size-3" aria-hidden="true" />
      Local solamente
    </Badge>
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

function AttachmentTile({
  attachment,
  missing = false,
  priority = false,
  onPreviewSettled,
  onOpen
}: {
  attachment: SerializedAttachment;
  missing?: boolean;
  priority?: boolean;
  onPreviewSettled?: (attachmentId: string) => void;
  onOpen?: () => void;
}) {
  const isImage = isPreviewableAttachment(attachment, missing);
  const [isPreviewLoading, setIsPreviewLoading] = useState(isImage);
  const previewSettledRef = useRef(false);

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

  const preview = (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-lavender-950/45">
      {isImage ? (
        <>
          {isPreviewLoading ? (
            <div className="image-preview-skeleton absolute inset-0" aria-hidden="true" />
          ) : null}
          <Image
            src={`/api/files/${attachment.id}/preview?w=520`}
            alt={attachment.originalName}
            width={640}
            height={480}
            sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1280px) calc((100vw - 5rem) / 2), 420px"
            className={cn(
              "h-full w-full object-cover transition duration-500",
              isPreviewLoading ? "scale-[1.02] opacity-0" : "scale-100 opacity-100"
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
    <div className="space-y-2 p-4">
      {missing ? <Badge tone="coral">Faltante</Badge> : null}
      <p className="truncate text-sm font-medium text-ink-100">{attachment.originalName}</p>
      <p className="text-xs text-lavender-200/55">
        {attachment.capturedAt ? `Capturada ${formatDateOnly(attachment.capturedAt)}` : "Sin fecha de captura"}
      </p>
    </div>
  );

  return (
    <Card className="overflow-hidden p-0">
      {isImage && onOpen ? (
        <button
          type="button"
          className="group block w-full text-left outline-none transition focus-visible:ring-2 focus-visible:ring-lavender-200/65"
          aria-label={`Abrir ${attachment.originalName} en tamaño completo`}
          onClick={onOpen}
        >
          {preview}
          {details}
        </button>
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

function isPreviewableAttachment(attachment: SerializedAttachment, missing: boolean | Set<string>) {
  const isMissing = missing instanceof Set ? missing.has(attachment.id) : missing;

  return Boolean(attachment.mimeType?.startsWith("image/") && !isMissing);
}

function formatDateOnly(value: string) {
  return formatDate(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
