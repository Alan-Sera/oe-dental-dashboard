import { describe, expect, it } from "vitest";
import {
  ALL_TEETH,
  PERMANENT_UPPER,
  PERMANENT_LOWER,
  PRIMARY_UPPER,
  PRIMARY_LOWER,
  TREATMENTS,
  availableSurfaces,
  findDuplicateRecords,
  upsertDentalRecord,
  isAnterior,
  isMolar,
  isToothNumber,
  isUpper,
  mesialIsRight,
  recordIsValid,
  sameDentalRecordContent,
  type DentalRecord,
  type Surface,
  type ToothNumber,
} from "@/lib/odontogram";

function makeRecord(overrides: Partial<DentalRecord> = {}): DentalRecord {
  return {
    id: "test-record",
    tooth: "26",
    treatment: "resin",
    surfaces: ["O"],
    phase: "current",
    status: "pending",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("odontograma FDI", () => {
  it("incluye 32 piezas permanentes y 20 temporales, sin repetir números", () => {
    expect(PERMANENT_UPPER).toHaveLength(16);
    expect(PERMANENT_LOWER).toHaveLength(16);
    expect(PRIMARY_UPPER).toHaveLength(10);
    expect(PRIMARY_LOWER).toHaveLength(10);
    expect(ALL_TEETH).toHaveLength(52);
    expect(new Set(ALL_TEETH).size).toBe(52);
  });

  it("distribuye las piezas en los ocho cuadrantes de ambas denticiones", () => {
    const expectedPermanentUpper = [
      "18", "17", "16", "15", "14", "13", "12", "11",
      "21", "22", "23", "24", "25", "26", "27", "28",
    ];
    const expectedPrimaryUpper = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"];
    const expectedPrimaryLower = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"];
    const expectedPermanentLower = [
      "48", "47", "46", "45", "44", "43", "42", "41",
      "31", "32", "33", "34", "35", "36", "37", "38",
    ];

    expect(PERMANENT_UPPER).toEqual(expectedPermanentUpper);
    expect(PRIMARY_UPPER).toEqual(expectedPrimaryUpper);
    expect(PRIMARY_LOWER).toEqual(expectedPrimaryLower);
    expect(PERMANENT_LOWER).toEqual(expectedPermanentLower);

    for (const quadrant of [1, 2, 3, 4]) {
      expect(ALL_TEETH.filter((tooth) => Number(tooth[0]) === quadrant)).toHaveLength(8);
    }
    for (const quadrant of [5, 6, 7, 8]) {
      expect(ALL_TEETH.filter((tooth) => Number(tooth[0]) === quadrant)).toHaveLength(5);
    }
  });

  it("reconoce números FDI válidos y rechaza cuadrantes o posiciones inválidas", () => {
    expect(isToothNumber("18")).toBe(true);
    expect(isToothNumber("75")).toBe(true);
    expect(isToothNumber("99")).toBe(false);
    expect(isToothNumber("19")).toBe(false);
    expect(isToothNumber("56")).toBe(false);
    expect(isToothNumber("1")).toBe(false);
  });

  it("mantiene lado y anatomía según el cuadrante y la dentición", () => {
    for (const tooth of ALL_TEETH) {
      const quadrant = Number(tooth[0]);
      const position = Number(tooth[1]);
      const primary = quadrant >= 5;

      expect(isUpper(tooth)).toBe([1, 2, 5, 6].includes(quadrant));
      expect(mesialIsRight(tooth)).toBe([1, 4, 5, 8].includes(quadrant));
      expect(isAnterior(tooth)).toBe(position <= 3);
      expect(isMolar(tooth)).toBe(position >= (primary ? 4 : 6));
    }
  });

  it("ofrece solo la superficie central que corresponde a cada pieza", () => {
    for (const tooth of ALL_TEETH) {
      const anterior = Number(tooth[1]) <= 3;
      const surfaces = availableSurfaces(tooth);

      expect(surfaces).toEqual(anterior
        ? ["M", "D", "V", "L", "I"]
        : ["M", "D", "V", "L", "O"]);
      expect(new Set(surfaces).size).toBe(surfaces.length);
    }
  });

  it("define tratamientos con códigos únicos y alcance explícito", () => {
    const codes = TREATMENTS.map(({ code }) => code);

    expect(TREATMENTS).toHaveLength(10);
    expect(new Set(codes).size).toBe(codes.length);
    expect(TREATMENTS.filter(({ scope }) => scope === "surface")).toHaveLength(4);
    expect(TREATMENTS.filter(({ scope }) => scope === "whole")).toHaveLength(6);
  });

  it("valida registros de superficie con al menos una superficie disponible", () => {
    expect(recordIsValid(makeRecord({ tooth: "11", surfaces: ["I"] }))).toBe(true);
    expect(recordIsValid(makeRecord({ tooth: "26", surfaces: ["O"] }))).toBe(true);
    expect(recordIsValid(makeRecord({ surfaces: [] }))).toBe(false);
  });

  it("rechaza superficies incompatibles, repetidas o no reconocidas", () => {
    expect(recordIsValid(makeRecord({ tooth: "11", surfaces: ["O"] }))).toBe(false);
    expect(recordIsValid(makeRecord({ tooth: "26", surfaces: ["I"] }))).toBe(false);
    expect(recordIsValid(makeRecord({ surfaces: ["O", "O"] }))).toBe(false);
    expect(recordIsValid(makeRecord({ surfaces: ["O", "X" as Surface] }))).toBe(false);
  });

  it("requiere que tratamientos de pieza completa no tengan superficies", () => {
    expect(recordIsValid(makeRecord({ treatment: "crown", surfaces: [] }))).toBe(true);
    expect(recordIsValid(makeRecord({ treatment: "crown", surfaces: ["O"] }))).toBe(false);
  });

  it("detecta superficies idénticas o parcialmente compartidas aunque cambie la fase", () => {
    const records = [
      makeRecord({ id: "exact", surfaces: ["M", "D"], phase: "previous" }),
      makeRecord({ id: "partial", surfaces: ["D"], phase: "current" }),
      makeRecord({ id: "disjoint", surfaces: ["V"] }),
    ];
    const candidate = makeRecord({ id: "candidate", surfaces: ["M", "D"] });

    expect(findDuplicateRecords(records, candidate).map(({ id }) => id)).toEqual(["exact", "partial"]);
  });

  it("no considera duplicados otra pieza, otro tratamiento ni superficies separadas", () => {
    const records = [
      makeRecord({ id: "other-tooth", tooth: "25", surfaces: ["O"] }),
      makeRecord({ id: "other-treatment", treatment: "caries", surfaces: ["O"] }),
      makeRecord({ id: "other-surface", surfaces: ["V"] }),
    ];

    expect(findDuplicateRecords(records, makeRecord({ surfaces: ["O"] }))).toEqual([]);
  });

  it("detecta tratamientos de pieza completa duplicados por pieza y tratamiento", () => {
    const existing = makeRecord({ id: "existing-crown", treatment: "crown", surfaces: [], phase: "previous" });
    const candidate = makeRecord({ id: "new-crown", treatment: "crown", surfaces: [], phase: "current" });

    expect(findDuplicateRecords([existing], candidate)).toEqual([existing]);
  });

  it("permite excluir de la detección el registro que se está editando", () => {
    const existing = makeRecord({ id: "same-record" });

    expect(findDuplicateRecords([existing], existing, existing.id)).toEqual([]);
    expect(findDuplicateRecords([existing], existing)).toEqual([existing]);
  });

  it("actualiza un registro conservando su ID y fecha original", () => {
    const existing = makeRecord({ id: "record-to-edit", createdAt: "2026-01-01T00:00:00.000Z" });
    const untouched = makeRecord({ id: "untouched", tooth: "27" });
    const candidate = makeRecord({
      ...existing,
      tooth: "25",
      treatment: "caries",
      surfaces: ["D"],
      phase: "previous",
      status: "completed",
      notes: "Nota editada",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    expect(upsertDentalRecord([existing, untouched], candidate)).toEqual([
      { ...candidate, id: existing.id, createdAt: existing.createdAt },
      untouched,
    ]);
  });

  it("detecta cambios en cualquier dato editable y normaliza notas y superficies", () => {
    const original = makeRecord({ surfaces: ["M", "D"], notes: "Nota original" });
    const unchanged = {
      ...original,
      id: "another-id",
      createdAt: "2026-02-01T00:00:00.000Z",
      surfaces: ["D", "M"] as Surface[],
      notes: " Nota original ",
    };

    expect(sameDentalRecordContent(original, unchanged)).toBe(true);

    const changedRecords: DentalRecord[] = [
      { ...original, tooth: "25" },
      { ...original, treatment: "caries" },
      { ...original, phase: "previous" },
      { ...original, surfaces: ["V"] },
      { ...original, status: "completed" },
      { ...original, notes: "Nota actualizada" },
    ];

    for (const changedRecord of changedRecords) {
      expect(sameDentalRecordContent(original, changedRecord)).toBe(false);
    }
  });

  it("agrega un registro nuevo sin modificar los existentes", () => {
    const existing = makeRecord({ id: "existing" });
    const candidate = makeRecord({ id: "new-record", tooth: "25" });

    expect(upsertDentalRecord([existing], candidate)).toEqual([existing, candidate]);
  });

  it("permite los tres estados tanto para registros Existentes como Actuales", () => {
    const phases = ["previous", "current"] as const;
    const statuses = ["pending", "in_progress", "completed"] as const;

    for (const phase of phases) {
      for (const status of statuses) {
        expect(recordIsValid(makeRecord({ phase, status }))).toBe(true);
      }
    }
  });

  it("rechaza piezas, tratamientos o listas de superficies mal formadas", () => {
    expect(recordIsValid(makeRecord({ tooth: "99" as ToothNumber }))).toBe(false);
    expect(recordIsValid(makeRecord({ treatment: "unknown" as DentalRecord["treatment"] }))).toBe(false);
    expect(recordIsValid(makeRecord({ phase: "future" as DentalRecord["phase"] }))).toBe(false);
    expect(recordIsValid(makeRecord({ status: "unknown" as DentalRecord["status"] }))).toBe(false);
    expect(recordIsValid(makeRecord({ surfaces: null as unknown as DentalRecord["surfaces"] }))).toBe(false);
    expect(recordIsValid(null as unknown as DentalRecord)).toBe(false);
  });
});
