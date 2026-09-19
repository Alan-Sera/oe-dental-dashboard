import { describe, expect, it } from "vitest";

import {
  describeNextAppointment,
  getAppointmentAnchor,
  getAppointmentNextAnchor,
  getRecentAttendance,
  getWeekdayLabel
} from "@/lib/attendance";

describe("attendance", () => {
  it("returns the 4 most recent appointments first", () => {
    const items = getRecentAttendance(
      [
        {
          id: "e1",
          notes: [
            "10-JUL-26 Revisión",
            "13-AGO-26 Limpieza",
            "14-SEP-26 Ajuste",
            "01-OCT-26 Control",
            "05-NOV-26 Cierre"
          ].join("\n")
        }
      ],
      4
    );

    expect(items.map((item) => item.dateText)).toEqual([
      "05-NOV-26",
      "01-OCT-26",
      "14-SEP-26",
      "13-AGO-26"
    ]);
  });

  it("marks no-show appointments and keeps weekday labels", () => {
    const items = getRecentAttendance([
      { id: "e1", notes: "10-JUL-26 NO ASISTIO" }
    ]);

    expect(items[0].hasNoShow).toBe(true);
    expect(getWeekdayLabel(items[0].normalizedDate)).toBe("Viernes");
  });

  it("describes the next appointment with weekday and date", () => {
    const next = describeNextAppointment("2026-08-24T12:00:00.000Z");

    expect(next?.weekday).toBe("Lunes");
    expect(next?.label.length).toBeGreaterThan(0);
    expect(describeNextAppointment(null)).toBeNull();
  });

  it("keeps history numbers and NEXT anchors per entry", () => {
    const items = getRecentAttendance([
      { id: "e1", notes: ["10-JUL-26 Revisión", "          NEXT: control"].join("\n") }
    ]);

    expect(items[0]).toMatchObject({
      entryId: "e1",
      appointmentIndex: 0,
      appointmentNumber: 1,
      hasNext: true
    });
    expect(getAppointmentAnchor(items[0])).toBe("cita-e1-0");
    expect(getAppointmentNextAnchor(items[0])).toBe("cita-e1-0-next");
  });
});
