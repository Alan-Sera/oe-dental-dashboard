import { describe, expect, it } from "vitest";

import { layoutOverlappingAppointments } from "../components/schedule/appointment-layout";

function appointment(id: string, startTime: string, endTime: string) {
  return { id, startTime, endTime };
}

describe("appointment overlap layout", () => {
  it("places simultaneous appointments in separate columns", () => {
    const layout = layoutOverlappingAppointments([
      appointment("a", "2026-10-12T11:00:00", "2026-10-12T12:00:00"),
      appointment("b", "2026-10-12T11:00:00", "2026-10-12T12:00:00"),
    ]);

    expect(layout.get("a")).toEqual({ columnIndex: 0, columnCount: 2 });
    expect(layout.get("b")).toEqual({ columnIndex: 1, columnCount: 2 });
  });

  it("keeps partially overlapping appointments side by side", () => {
    const layout = layoutOverlappingAppointments([
      appointment("a", "2026-10-12T11:00:00", "2026-10-12T12:00:00"),
      appointment("b", "2026-10-12T11:30:00", "2026-10-12T12:30:00"),
    ]);

    expect(layout.get("a")).toEqual({ columnIndex: 0, columnCount: 2 });
    expect(layout.get("b")).toEqual({ columnIndex: 1, columnCount: 2 });
  });

  it("allocates enough columns for nested appointments", () => {
    const layout = layoutOverlappingAppointments([
      appointment("a", "2026-10-12T09:00:00", "2026-10-12T12:00:00"),
      appointment("b", "2026-10-12T09:30:00", "2026-10-12T11:30:00"),
      appointment("c", "2026-10-12T10:00:00", "2026-10-12T10:30:00"),
    ]);

    expect(layout.get("a")).toEqual({ columnIndex: 0, columnCount: 3 });
    expect(layout.get("b")).toEqual({ columnIndex: 1, columnCount: 3 });
    expect(layout.get("c")).toEqual({ columnIndex: 2, columnCount: 3 });
  });

  it("gives appointments full width when they are separate or consecutive", () => {
    const layout = layoutOverlappingAppointments([
      appointment("a", "2026-10-12T09:00:00", "2026-10-12T10:00:00"),
      appointment("b", "2026-10-12T10:00:00", "2026-10-12T11:00:00"),
      appointment("c", "2026-10-12T12:00:00", "2026-10-12T13:00:00"),
    ]);

    expect(layout.get("a")).toEqual({ columnIndex: 0, columnCount: 1 });
    expect(layout.get("b")).toEqual({ columnIndex: 0, columnCount: 1 });
    expect(layout.get("c")).toEqual({ columnIndex: 0, columnCount: 1 });
  });

  it("reuses a lane after a nested appointment ends", () => {
    const layout = layoutOverlappingAppointments([
      appointment("long", "2026-10-12T09:00:00", "2026-10-12T12:00:00"),
      appointment("short", "2026-10-12T10:00:00", "2026-10-12T11:00:00"),
      appointment("next", "2026-10-12T11:00:00", "2026-10-12T13:00:00"),
    ]);

    expect(layout.get("long")).toEqual({ columnIndex: 0, columnCount: 2 });
    expect(layout.get("short")).toEqual({ columnIndex: 1, columnCount: 2 });
    expect(layout.get("next")).toEqual({ columnIndex: 1, columnCount: 2 });
  });
});
