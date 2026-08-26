import { describe, expect, it } from "vitest";

import {
  appendTextHistoryAppointment,
  createTextHistoryAppointment,
  hasNoShowText,
  markTextHistoryAppointmentNoShow,
  normalizeClinicalDateText,
  parseLinkedTextHistory,
  removeTextHistoryAppointment,
  replaceTextHistoryAppointment,
  serializeDeletedTextHistoryBlockBackup,
  serializeLinkedTextHistory,
} from "@/lib/text-history-parser";

describe("text history parser", () => {
  it("separates patient information from dated appointments", () => {
    const history = parseLinkedTextHistory(
      [
        "PACIENTE EJEMPLO",
        "Alergias negadas",
        "",
        "10-JUL-26 Se presenta a revision",
        "          Se toman fotografias",
        "13-abr-24 Limpieza dental",
      ].join("\r\n"),
    );

    expect(history.information).toBe("PACIENTE EJEMPLO\nAlergias negadas");
    expect(history.appointments).toHaveLength(2);
    expect(history.appointments[0]).toMatchObject({
      dateText: "10-JUL-26",
      normalizedDate: "2026-07-10",
      body: "Se presenta a revision\n          Se toman fotografias",
    });
    expect(history.appointments[1]).toMatchObject({
      dateText: "13-abr-24",
      normalizedDate: "2024-04-13",
      body: "Limpieza dental",
    });
  });

  it("normalizes supported date formats without replacing the original text", () => {
    expect(normalizeClinicalDateText("1-OCT-24")).toBe("2024-10-01");
    expect(normalizeClinicalDateText("08-AGO-26")).toBe("2026-08-08");
    expect(normalizeClinicalDateText("13-12-22")).toBe("2022-12-13");
    expect(normalizeClinicalDateText("31-13-26")).toBeNull();
  });

  it("keeps empty appointments when a date has no content", () => {
    const history = parseLinkedTextHistory("10-JUL-26\r\n14-SEP-26\r\n");

    expect(history.appointments).toEqual([
      {
        dateText: "10-JUL-26",
        normalizedDate: "2026-07-10",
        body: "",
        next: "",
        hasNext: false,
        hasNoShow: false,
      },
      {
        dateText: "14-SEP-26",
        normalizedDate: "2026-09-14",
        body: "",
        next: "",
        hasNext: false,
        hasNoShow: false,
      },
    ]);
  });

  it("detects no-show notes with or without accents", () => {
    expect(hasNoShowText("25-jun-24 4:30pm NO ASISTIO")).toBe(true);
    expect(hasNoShowText("19-abr-24 ajuste NO ASISTIÓ")).toBe(true);
    expect(hasNoShowText("Paciente asistio puntual")).toBe(false);
  });

  it("marks an appointment as no-show at the end of the body", () => {
    const history = parseLinkedTextHistory("10-JUL-26 Ajuste");
    const appointment = markTextHistoryAppointmentNoShow(
      history.appointments[0],
    );

    expect(appointment.body).toBe("Ajuste\nNO ASISTIO");
    expect(appointment.hasNoShow).toBe(true);

    const nextHistory = replaceTextHistoryAppointment(history, 0, appointment);

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      ["10-JUL-26 Ajuste", "NO ASISTIO"].join("\n"),
    );
  });

  it("marks an empty appointment as no-show", () => {
    const history = parseLinkedTextHistory("10-JUL-26");
    const appointment = markTextHistoryAppointmentNoShow(
      history.appointments[0],
    );

    expect(appointment.body).toBe("NO ASISTIO");
    const nextHistory = replaceTextHistoryAppointment(history, 0, appointment);

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      "10-JUL-26 NO ASISTIO",
    );
  });

  it("does not duplicate an existing no-show marker", () => {
    const history = parseLinkedTextHistory("10-JUL-26 NO ASISTIO");
    const appointment = markTextHistoryAppointmentNoShow(
      history.appointments[0],
    );

    expect(appointment.body).toBe("NO ASISTIO");
    const nextHistory = replaceTextHistoryAppointment(history, 0, appointment);

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      "10-JUL-26 NO ASISTIO",
    );
  });

  it("keeps the no-show marker before NEXT when serializing", () => {
    const history = parseLinkedTextHistory(
      ["10-JUL-26 Ajuste", "          NEXT: revisar"].join("\n"),
    );
    const appointment = markTextHistoryAppointmentNoShow(
      history.appointments[0],
    );
    const nextHistory = replaceTextHistoryAppointment(history, 0, appointment);

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      ["10-JUL-26 Ajuste", "NO ASISTIO", "          NEXT: revisar"].join("\n"),
    );
  });

  it("separates NEXT into the appointment where it appears", () => {
    const history = parseLinkedTextHistory(
      [
        "28-SEP-23 Ajuste y modulos",
        "          Next: cambiar open coil",
        "          Next: retirar retroligadura",
        "13-NOV-23 Separadores",
      ].join("\n"),
    );

    expect(history.appointments[0].body).toBe("Ajuste y modulos");
    expect(history.appointments[0].hasNext).toBe(true);
    expect(history.appointments[0].next).toBe(
      "cambiar open coil\nretirar retroligadura",
    );
    expect(history.appointments[1].body).toBe("Separadores");
  });

  it("serializes structured history with the selected line ending", () => {
    const history = parseLinkedTextHistory(
      [
        "PACIENTE EJEMPLO",
        "",
        "10-JUL-26 Ajuste",
        "          NEXT: limpieza",
        "14-SEP-26",
      ].join("\n"),
    );

    expect(serializeLinkedTextHistory(history, "\r\n")).toBe(
      [
        "PACIENTE EJEMPLO",
        "10-JUL-26 Ajuste",
        "          NEXT: limpieza",
        "14-SEP-26",
      ].join("\r\n"),
    );
  });

  it("creates a new appointment with a local clinical date label", () => {
    const appointment = createTextHistoryAppointment(new Date(2026, 7, 26));

    expect(appointment).toMatchObject({
      dateText: "26-AGO-26",
      normalizedDate: "2026-08-26",
      body: "",
      next: "",
      hasNext: false,
    });
  });

  it("adds a new appointment and serializes it at the end", () => {
    const history = parseLinkedTextHistory("PACIENTE\n10-JUL-26 Ajuste");
    const nextHistory = appendTextHistoryAppointment(
      history,
      createTextHistoryAppointment(new Date(2026, 7, 26)),
    );

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      ["PACIENTE", "10-JUL-26 Ajuste", "26-AGO-26"].join("\n"),
    );
  });

  it("adds NEXT to an existing appointment", () => {
    const history = parseLinkedTextHistory("10-JUL-26 Ajuste");
    const nextHistory = replaceTextHistoryAppointment(history, 0, {
      ...history.appointments[0],
      next: "Cambiar liga",
      hasNext: true,
    });

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      ["10-JUL-26 Ajuste", "          NEXT: Cambiar liga"].join("\n"),
    );
  });

  it("removes an appointment while keeping the rest of the history", () => {
    const history = parseLinkedTextHistory(
      ["PACIENTE", "10-JUL-26 Ajuste", "14-SEP-26 Limpieza"].join("\n"),
    );
    const nextHistory = removeTextHistoryAppointment(history, 0);

    expect(serializeLinkedTextHistory(nextHistory)).toBe(
      ["PACIENTE", "14-SEP-26 Limpieza"].join("\n"),
    );
  });

  it("removes NEXT from an appointment", () => {
    const history = parseLinkedTextHistory(
      ["10-JUL-26 Ajuste", "          NEXT: Revisar mordida"].join("\n"),
    );
    const nextHistory = replaceTextHistoryAppointment(history, 0, {
      ...history.appointments[0],
      next: "",
      hasNext: false,
    });

    expect(serializeLinkedTextHistory(nextHistory)).toBe("10-JUL-26 Ajuste");
  });

  it("serializes a deleted block for backup", () => {
    expect(
      serializeDeletedTextHistoryBlockBackup({
        type: "appointment",
        label: "Cita 2 - 14-SEP-26",
        content: "14-SEP-26 Limpieza",
      }),
    ).toBe(
      [
        "Tipo: Cita",
        "Referencia: Cita 2 - 14-SEP-26",
        "",
        "14-SEP-26 Limpieza",
      ].join("\n"),
    );
  });
});
