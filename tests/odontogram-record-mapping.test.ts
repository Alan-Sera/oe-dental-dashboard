import { describe, expect, it } from "vitest";

import {
  mapPersistedOdontogramRecord,
  type PersistedOdontogramRecord,
} from "@/lib/odontogram-record-mapping";

function makePersistedRecord(
  overrides: Partial<PersistedOdontogramRecord> = {},
): PersistedOdontogramRecord {
  return {
    id: "record-1",
    tooth: "21",
    treatment: "resin",
    phase: "current",
    status: "pending",
    notes: "",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    surfaces: [{ surface: "M" }, { surface: "V" }],
    ...overrides,
  };
}

describe("mapeo de registros persistidos del odontograma", () => {
  it("convierte la fecha a ISO y ordena superficies de forma consistente", () => {
    const result = mapPersistedOdontogramRecord(makePersistedRecord({
      surfaces: [{ surface: "V" }, { surface: "M" }, { surface: "D" }],
    }));

    expect(result).toEqual({
      id: "record-1",
      tooth: "21",
      treatment: "resin",
      phase: "current",
      status: "pending",
      notes: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      surfaces: ["M", "D", "V"],
    });
  });

  it("rechaza datos persistidos incompatibles con las reglas clínicas validadas", () => {
    expect(() => mapPersistedOdontogramRecord(makePersistedRecord({
      tooth: "21",
      treatment: "resin",
      surfaces: [{ surface: "O" }],
    }))).toThrow("contiene datos inválidos");
  });
});
