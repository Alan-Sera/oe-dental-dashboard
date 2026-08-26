import { describe, expect, it } from "vitest";

import {
  hasNoShowText,
  normalizeClinicalDateText,
  parseLinkedTextHistory,
  serializeLinkedTextHistory
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
        "13-abr-24 Limpieza dental"
      ].join("\r\n")
    );

    expect(history.information).toBe("PACIENTE EJEMPLO\nAlergias negadas");
    expect(history.appointments).toHaveLength(2);
    expect(history.appointments[0]).toMatchObject({
      dateText: "10-JUL-26",
      normalizedDate: "2026-07-10",
      body: "Se presenta a revision\n          Se toman fotografias"
    });
    expect(history.appointments[1]).toMatchObject({
      dateText: "13-abr-24",
      normalizedDate: "2024-04-13",
      body: "Limpieza dental"
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
        hasNoShow: false
      },
      {
        dateText: "14-SEP-26",
        normalizedDate: "2026-09-14",
        body: "",
        next: "",
        hasNext: false,
        hasNoShow: false
      }
    ]);
  });

  it("detects no-show notes with or without accents", () => {
    expect(hasNoShowText("25-jun-24 4:30pm NO ASISTIO")).toBe(true);
    expect(hasNoShowText("19-abr-24 ajuste NO ASISTIÓ")).toBe(true);
    expect(hasNoShowText("Paciente asistio puntual")).toBe(false);
  });

  it("separates NEXT into the appointment where it appears", () => {
    const history = parseLinkedTextHistory(
      [
        "28-SEP-23 Ajuste y modulos",
        "          Next: cambiar open coil",
        "          Next: retirar retroligadura",
        "13-NOV-23 Separadores"
      ].join("\n")
    );

    expect(history.appointments[0].body).toBe("Ajuste y modulos");
    expect(history.appointments[0].hasNext).toBe(true);
    expect(history.appointments[0].next).toBe(
      "cambiar open coil\nretirar retroligadura"
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
        "14-SEP-26"
      ].join("\n")
    );

    expect(serializeLinkedTextHistory(history, "\r\n")).toBe(
      [
        "PACIENTE EJEMPLO",
        "10-JUL-26 Ajuste",
        "          NEXT: limpieza",
        "14-SEP-26"
      ].join("\r\n")
    );
  });
});
