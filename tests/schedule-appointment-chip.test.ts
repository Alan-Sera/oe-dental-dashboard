import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppointmentChip } from "../components/schedule/appointment-chip";
import { MonthView } from "../components/schedule/month-view";
import { WeekView } from "../components/schedule/week-view";
import type { AgendaAppointment } from "../components/schedule/types";

const appointment: AgendaAppointment = {
  id: "appointment-1",
  patientId: "patient-1",
  title: "Revisión clínica larga",
  description: null,
  startTime: "2026-10-12T11:00:00",
  endTime: "2026-10-12T12:00:00",
  status: "SCHEDULED",
  color: null,
  googleEventId: "google-event-1",
  patientName: "Persona Paciente Apellido",
  patientPhone: null,
  patientEmail: null,
};

describe("appointment chip text layout", () => {
  it("keeps the existing truncated presentation by default", () => {
    const markup = renderToStaticMarkup(
      createElement(AppointmentChip, { appointment, showTime: true, showPatient: true }),
    );

    expect(markup).toContain("px-2");
    expect(markup.match(/truncate/g)).toHaveLength(2);
    expect(markup).not.toContain("overflow-hidden");
    expect(markup).not.toContain("title=");
  });

  it("wraps overlapping chip text and uses the app tooltip", () => {
    const markup = renderToStaticMarkup(
      createElement(AppointmentChip, {
        appointment,
        showTime: true,
        showPatient: true,
        wrapText: true,
      }),
    );

    expect(markup).toContain("overflow-hidden px-1");
    expect(markup.match(/whitespace-normal break-words/g)).toHaveLength(2);
    expect(markup).not.toContain("truncate");
    expect(markup).toContain("data-base-ui-tooltip-trigger");
    expect(markup).not.toContain("title=");
  });

  it("uses the app tooltip for details without adding the patient to visible text", () => {
    const markup = renderToStaticMarkup(
      createElement(AppointmentChip, {
        appointment,
        showTime: true,
        showDetailsOnHover: true,
      }),
    );

    expect(markup).toContain("data-base-ui-tooltip-trigger");
    expect(markup).not.toContain("title=");
    expect(markup).not.toContain(appointment.patientName);
    expect(markup).toContain("truncate");
  });

  it("uses the app tooltip on non-wrapped chips in the week view", () => {
    const markup = renderToStaticMarkup(
      createElement(WeekView, {
        dateKey: "2026-10-12",
        appointments: [appointment],
        onCreateAt: () => undefined,
        onEdit: () => undefined,
        onSelectDay: () => undefined,
      }),
    );

    expect(markup).toContain("data-base-ui-tooltip-trigger");
    expect(markup).not.toContain("title=");
    expect(markup).toContain("truncate");
    expect(markup.match(/aria-label="Seleccionar día:/g)).toHaveLength(7);
    expect(markup).toContain("size-7 items-center justify-center rounded-full text-sm");
  });

  it("uses the app tooltip on month chips without displaying the patient", () => {
    const markup = renderToStaticMarkup(
      createElement(MonthView, {
        dateKey: "2026-10-12",
        appointments: [appointment],
        onSelectDay: () => undefined,
        onEditAppointment: () => undefined,
        onCreateInDay: () => undefined,
      }),
    );

    expect(markup).toContain("data-base-ui-tooltip-trigger");
    expect(markup).not.toContain("title=");
    expect(markup).not.toContain(appointment.patientName);
  });
});
