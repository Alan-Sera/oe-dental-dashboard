"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock } from "lucide-react";
import { useForm } from "react-hook-form";

import { createAppointment, deleteAppointment, updateAppointment } from "@/lib/actions/appointments.actions";
import {
  formatLongDate,
  formatTime,
  fromDatetimeLocal,
  toDatetimeLocal
} from "@/lib/date-utils";
import { APPOINTMENT_TITLE_PREFIX, appointmentInputSchema, appointmentStatuses, type AppointmentInput } from "@/lib/validation";
import { appointmentStatusLabels, GOOGLE_CALENDAR_COLORS } from "@/components/schedule/constants";
import { AppointmentStatusBadge } from "@/components/schedule/appointment-status-badge";
import { CalendarWithPresets } from "@/components/schedule/calendar-with-presets";
import type { AgendaAppointment, AgendaPatient } from "@/components/schedule/types";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogHandle
} from "@/components/ui/dialog";
import { FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TIME_SLOTS = [
  { value: "08:00", label: "08:00" },
  { value: "08:30", label: "08:30" },
  { value: "09:00", label: "09:00" },
  { value: "09:30", label: "09:30" },
  { value: "10:00", label: "10:00" },
  { value: "10:30", label: "10:30" },
  { value: "11:00", label: "11:00" },
  { value: "11:30", label: "11:30" },
  { value: "12:00", label: "12:00" },
  { value: "12:30", label: "12:30" },
  { value: "13:00", label: "13:00" },
  { value: "13:30", label: "13:30" },
  { value: "14:00", label: "14:00" },
  { value: "14:30", label: "14:30" },
  { value: "16:00", label: "16:00" },
  { value: "16:30", label: "16:30" },
  { value: "17:00", label: "17:00" },
  { value: "17:30", label: "17:30" },
  { value: "18:00", label: "18:00" },
  { value: "18:30", label: "18:30" },
  { value: "19:00", label: "19:00" },
  { value: "19:30", label: "19:30" },
  { value: "20:00", label: "20:00" },
  { value: "20:30", label: "20:30" }
];

const STANDARD_DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1 hora y media" },
  { value: 120, label: "2 horas" }
];

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseDatetimeLocal(value: string) {
  const time = value.slice(11, 16) || "09:00";
  return { day: startOfDay(fromDatetimeLocal(value)), time };
}

function composeRange(day: Date, time: string, durationMinutes: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const start = new Date(day);
  start.setHours(hours || 0, minutes || 0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { startTime: toDatetimeLocal(start), endTime: toDatetimeLocal(end), start, end };
}

export function AppointmentModal({
  open,
  dialogHandle,
  mode,
  appointment,
  defaultStartTime,
  defaultEndTime,
  presetPatientId,
  adoptGoogleEventId,
  presetTitle,
  presetDescription,
  patients,
  onClose,
  onChanged
}: {
  open: boolean;
  dialogHandle?: DialogHandle;
  mode: "create" | "edit";
  appointment: AppointmentData | null;
  defaultStartTime: string;
  defaultEndTime: string;
  presetPatientId?: string;
  adoptGoogleEventId?: string | null;
  presetTitle?: string;
  presetDescription?: string;
  patients: AgendaPatient[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const patientInputId = useId();
  const patientErrorId = useId();
  const dateErrorId = useId();
  const titleId = useId();
  const notesId = useId();
  const colorGroupId = useId();
  const dialogDescriptionId = useId();
  const timeGroupLabelId = useId();
  const durationGroupLabelId = useId();
  const statusId = useId();
  const [isPending, startTransition] = useTransition();
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isAdopting = mode === "create" && Boolean(adoptGoogleEventId);

  const initial = useMemo(() => {
    const startValue =
      mode === "edit" && appointment
        ? toDatetimeLocal(new Date(appointment.startTime))
        : defaultStartTime;
    const endValue =
      mode === "edit" && appointment
        ? toDatetimeLocal(new Date(appointment.endTime))
        : defaultEndTime;
    const { day, time } = parseDatetimeLocal(startValue);
    const minutes = Math.round(
      (fromDatetimeLocal(endValue).getTime() - fromDatetimeLocal(startValue).getTime()) / 60000
    );
    let title: string;
    if (mode === "edit" && appointment) {
      title = appointment.title ?? "";
    } else if (presetTitle) {
      title = presetTitle;
    } else {
      const presetPatientName = presetPatientId
        ? (patients.find((patient) => patient.id === presetPatientId)?.fullName ?? "")
        : "";
      title = presetPatientName
        ? `${APPOINTMENT_TITLE_PREFIX}${presetPatientName}`
        : APPOINTMENT_TITLE_PREFIX;
    }
    return { day, time, duration: minutes > 0 ? minutes : 60, title };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, appointment?.id, defaultStartTime, defaultEndTime, presetPatientId, presetTitle]);

  const [selectedDay, setSelectedDay] = useState<Date>(() => initial.day);
  const [startTime, setStartTime] = useState(initial.time);
  const [durationMinutes, setDurationMinutes] = useState(initial.duration);

  const form = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentInputSchema),
    defaultValues: {
      patientId: mode === "edit" ? appointment?.patientId ?? "" : presetPatientId ?? "",
      title: initial.title,
      ...composeRange(initial.day, initial.time, initial.duration),
      description: mode === "edit" ? appointment?.description ?? "" : presetDescription ?? "",
      status: mode === "edit" ? appointment?.status ?? "SCHEDULED" : undefined,
      color: mode === "edit" ? appointment?.color ?? "" : "",
      adoptGoogleEventId: adoptGoogleEventId ?? null
    }
  });

  useEffect(() => {
    form.reset({
      patientId: mode === "edit" ? appointment?.patientId ?? "" : presetPatientId ?? "",
      title: initial.title,
      ...composeRange(initial.day, initial.time, initial.duration),
      description: mode === "edit" ? appointment?.description ?? "" : presetDescription ?? "",
      status: mode === "edit" ? appointment?.status ?? "SCHEDULED" : undefined,
      color: mode === "edit" ? appointment?.color ?? "" : "",
      adoptGoogleEventId: adoptGoogleEventId ?? null
    });
    setSelectedDay(initial.day);
    setStartTime(initial.time);
    setDurationMinutes(initial.duration);
    setSyncNotice(null);
    setConfirmingDelete(false);
  }, [mode, appointment, presetPatientId, presetTitle, presetDescription, adoptGoogleEventId, initial, form]);

  useEffect(() => {
    const range = composeRange(selectedDay, startTime, durationMinutes);
    form.setValue("startTime", range.startTime, { shouldValidate: true });
    form.setValue("endTime", range.endTime, { shouldValidate: true });
  }, [selectedDay, startTime, durationMinutes, form]);

  const patientId = form.watch("patientId");
  const colorValue = form.watch("color") ?? "";
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === patientId) ?? null,
    [patients, patientId]
  );

  const timeOptions = useMemo(() => {
    if (TIME_SLOTS.some((option) => option.value === startTime)) {
      return TIME_SLOTS;
    }
    return [{ value: startTime, label: startTime }, ...TIME_SLOTS];
  }, [startTime]);

  const durationOptions = useMemo(() => {
    if (STANDARD_DURATIONS.some((option) => option.value === durationMinutes)) {
      return STANDARD_DURATIONS;
    }
    return [{ value: durationMinutes, label: `${durationMinutes} min` }, ...STANDARD_DURATIONS];
  }, [durationMinutes]);

  const summary = useMemo(() => {
    const range = composeRange(selectedDay, startTime, durationMinutes);
    return `${formatLongDate(range.start)} · ${formatTime(range.start)} – ${formatTime(range.end)}`;
  }, [selectedDay, startTime, durationMinutes]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isPending) onClose();
  }

  function handleSubmit(values: AppointmentInput) {
    startTransition(async () => {
      if (mode === "create") {
        const result = await createAppointment(values);
        if (result.synced) {
          onChanged();
          onClose();
        } else {
          setSyncNotice(result.syncError ?? "No se pudo sincronizar con Google Calendar");
          onChanged();
        }
      } else {
        const result = await updateAppointment(appointment?.id ?? "", values);
        if (result.synced) {
          onChanged();
          onClose();
        } else {
          setSyncNotice(result.syncError ?? "No se pudo sincronizar con Google Calendar");
          onChanged();
        }
      }
    });
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    startTransition(async () => {
      const result = await deleteAppointment(appointment?.id ?? "");
      if (!result.synced && result.syncError) {
        setSyncNotice(result.syncError);
      }
      onChanged();
      onClose();
    });
  }

  const patientError = form.formState.errors.patientId?.message;
  const dateError = form.formState.errors.startTime?.message ?? form.formState.errors.endTime?.message;
  const titleError = form.formState.errors.title?.message;
  const descriptionError = form.formState.errors.description?.message;
  const statusError = form.formState.errors.status?.message;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} handle={dialogHandle}>
      <DialogContent aria-describedby={dialogDescriptionId}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>
              <CalendarClock className="size-5 text-lavender-200" aria-hidden="true" />
              {isAdopting ? "Asignar cita de Google" : mode === "edit" ? "Editar cita" : "Crear nueva cita"}
            </DialogTitle>
            {mode === "edit" && appointment ? (
              <AppointmentStatusBadge status={appointment.status} />
            ) : null}
          </div>
          <DialogDescription id={dialogDescriptionId}>
            {isAdopting
              ? "Vincula el evento de Google con un paciente, elige el día y la hora."
              : "Elige el paciente, día, hora y duración de la cita."}
          </DialogDescription>
        </DialogHeader>

        {syncNotice ? (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
            La cita se guardó localmente, pero no se sincronizó con Google Calendar: {syncNotice}
          </div>
        ) : null}

        {isAdopting ? (
          <div className="mb-4 rounded-md border border-brand-400/40 bg-brand-900/60 px-3 py-2 text-sm text-brand-200">
            Esta cita ya existe en Google Calendar. Al guardar se vinculará al paciente sin crear un evento
            duplicado.
          </div>
        ) : null}

        {mode === "edit" && appointment && !appointment.googleEventId ? (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
            Esta cita aún no está sincronizada con Google Calendar. Si la guardas, se intentará sincronizar
            ahora.
          </div>
        ) : null}

        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <FieldGroup>
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor={patientInputId}>Paciente</FieldLabel>
              <Combobox
                items={patients}
                value={selectedPatient}
                onValueChange={(value) => {
                  form.setValue("patientId", value?.id ?? "", {
                    shouldValidate: true,
                    shouldDirty: true
                  });
                  if (value) {
                    const currentTitle = form.getValues("title")?.trim() ?? "";
                    const previousAutoTitle = selectedPatient
                      ? `${APPOINTMENT_TITLE_PREFIX}${selectedPatient.fullName}`
                      : APPOINTMENT_TITLE_PREFIX;
                    if (
                      currentTitle === "" ||
                      currentTitle === APPOINTMENT_TITLE_PREFIX.trim() ||
                      currentTitle === previousAutoTitle
                    ) {
                      form.setValue("title", `${APPOINTMENT_TITLE_PREFIX}${value.fullName}`, {
                        shouldDirty: true,
                        shouldValidate: true
                      });
                    }
                  }
                }}
                autoHighlight
                itemToStringLabel={(patient) => patient.fullName}
                isItemEqualToValue={(a, b) => a?.id === b?.id}
              >
                <ComboboxInput
                  id={patientInputId}
                  placeholder="Buscar paciente por nombre"
                  aria-invalid={Boolean(patientError)}
                  aria-describedby={patientError ? patientErrorId : undefined}
                  disabled={isPending}
                />
                <ComboboxContent>
                  <ComboboxEmpty>
                    <span className="block px-2.5 py-6">Sin pacientes encontrados.</span>
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(patient: AgendaPatient) => (
                      <ComboboxItem key={patient.id} value={patient}>
                        {patient.fullName}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <input type="hidden" {...form.register("patientId")} />
              <FieldDescription>Escribe o selecciona el paciente.</FieldDescription>
              <span id={patientErrorId}>
                <FieldError>{patientError}</FieldError>
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <div className="grid gap-2 grid-cols-2">
                <FieldLabel>Día</FieldLabel>
                <span id={timeGroupLabelId} className="text-sm text-lavender-100/85">
                  Hora de inicio
                </span>
              </div>
              <div className="grid gap-2 grid-cols-2">
                <CalendarWithPresets
                  selectedDay={selectedDay}
                  onSelect={(day) => setSelectedDay(day)}
                  disabled={isPending}
                />
                <div className="flex flex-col gap-4">
                  <div
                    role="radiogroup"
                    aria-labelledby={timeGroupLabelId}
                    className="grid max-h-65 grid-cols-4 content-start gap-1 overflow-y-auto pr-0.5"
                  >
                    {timeOptions.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={startTime === option.value}
                        variant={startTime === option.value ? "primary" : "secondary"}
                        size="md"
                        onClick={() => setStartTime(option.value)}
                        disabled={isPending}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <span id={durationGroupLabelId} className="text-sm text-lavender-100/85">
                      Duración
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby={durationGroupLabelId}
                      className="grid grid-cols-2 content-start gap-2"
                    >
                      {durationOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={durationMinutes === option.value}
                          variant={durationMinutes === option.value ? "primary" : "secondary"}
                          onClick={() => setDurationMinutes(option.value)}
                          disabled={isPending}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid place-items-center">
                <FieldDescription>{summary}</FieldDescription>
              </div>
              <span id={dateErrorId}>
                <FieldError>{dateError}</FieldError>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor={titleId}>Título</FieldLabel>
              <Input
                id={titleId}
                type="text"
                placeholder="Ej. Limpieza dental"
                aria-invalid={Boolean(titleError)}
                {...form.register("title")}
                disabled={isPending}
              />
              <FieldError>{titleError}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor={notesId}>Descripción / notas</FieldLabel>
              <Textarea
                id={notesId}
                rows={2}
                placeholder="Detalles de la cita..."
                aria-invalid={Boolean(descriptionError)}
                {...form.register("description")}
                disabled={isPending}
              />
              <FieldError>{descriptionError}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <span id={colorGroupId} className="text-sm font-medium text-lavender-100">
                Color del evento
              </span>
              <div
                role="radiogroup"
                aria-labelledby={colorGroupId}
                className="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={colorValue === ""}
                  onClick={() => form.setValue("color", "", { shouldDirty: true })}
                  disabled={isPending}
                  className="group relative size-8 rounded-full border-2 border-lavender-500/50 bg-lavender-800/40 transition hover:border-lavender-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60"
                  title="Predeterminado (según estado)"
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-lavender-200/70">
                    Auto
                  </span>
                  {colorValue === "" ? (
                    <span className="absolute -inset-0.5 rounded-full ring-2 ring-lavender-300/80" />
                  ) : null}
                </button>
                {GOOGLE_CALENDAR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={colorValue === c.id}
                    onClick={() => form.setValue("color", c.id, { shouldDirty: true })}
                    disabled={isPending}
                    className="group relative size-8 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60"
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {colorValue === c.id ? (
                      <span className="absolute -inset-0.5 rounded-full ring-2 ring-white" />
                    ) : null}
                  </button>
                ))}
              </div>
              <FieldDescription>Selecciona un color para identificar la cita en el calendario.</FieldDescription>
            </div>

            {mode === "edit" ? (
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor={statusId}>Estado</FieldLabel>
                <Select id={statusId} {...form.register("status")} disabled={isPending} aria-invalid={Boolean(statusError)}>
                  {appointmentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {appointmentStatusLabels[status] ?? status}
                    </option>
                  ))}
                </Select>
                <FieldError>{statusError}</FieldError>
              </div>
            ) : null}
          </FieldGroup>

          <DialogFooter className="mt-4">
            {mode === "edit" ? (
              <Button
                type="button"
                variant={confirmingDelete ? "danger" : "secondary"}
                disabled={isPending}
                onClick={handleDelete}
              >
                {confirmingDelete ? "¿Confirmar eliminación?" : "Eliminar cita"}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isAdopting ? "Vincular cita" : "Guardar cita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog >
  );
}

type AppointmentData = Pick<
  AgendaAppointment,
  "id" | "patientId" | "title" | "description" | "startTime" | "endTime" | "status" | "color" | "googleEventId"
> | null;
