import { describe, expect, it } from "vitest";

import {
  filterPatientDirectory,
  filterPatientsByQuery,
  getPatientSuggestions,
  normalizePhoneSearch,
  normalizeSearchText,
  sortPatientsByName,
  type PatientDirectoryRecord
} from "@/lib/patient-search";

const patients = [
  { fullName: "María López", phone: "(998) 123-4567" },
  { fullName: "Ana Ruiz", phone: "55 2020 3030" },
  { fullName: "Carlos Núñez", phone: null }
];

const directoryPatients: PatientDirectoryRecord[] = [
  {
    fullName: "María López",
    phone: "(998) 123-4567",
    gender: "FEMENINO",
    nextAppointmentDate: "2026-08-24T12:00:00.000Z",
    balanceCents: 0
  },
  {
    fullName: "Ana Ruiz",
    phone: "55 2020 3030",
    gender: "FEMENINO",
    nextAppointmentDate: "2026-08-25T12:00:00.000Z",
    balanceCents: 8500
  },
  {
    fullName: "Carlos Núñez",
    phone: null,
    gender: "MASCULINO",
    nextAppointmentDate: "2026-08-24T12:00:00.000Z",
    balanceCents: 12000
  }
];

describe("patient search", () => {
  it("normalizes accents and case for names", () => {
    expect(normalizeSearchText("  MARÍA  ")).toBe("maria");
    expect(filterPatientsByQuery(patients, "maria")).toEqual([patients[0]]);
  });

  it("normalizes phone numbers", () => {
    expect(normalizePhoneSearch("(998) 123-4567")).toBe("9981234567");
    expect(filterPatientsByQuery(patients, "998123")).toEqual([patients[0]]);
  });

  it("limits visual suggestions", () => {
    expect(getPatientSuggestions(patients, "a", 2)).toHaveLength(2);
  });

  it("sorts patients alphabetically in both directions", () => {
    expect(sortPatientsByName(directoryPatients, "asc").map((patient) => patient.fullName)).toEqual([
      "Ana Ruiz",
      "Carlos Núñez",
      "María López"
    ]);
    expect(sortPatientsByName(directoryPatients, "desc").map((patient) => patient.fullName)).toEqual([
      "María López",
      "Carlos Núñez",
      "Ana Ruiz"
    ]);
  });

  it("filters by gender", () => {
    const results = filterPatientDirectory(directoryPatients, {
      query: "",
      genderFilter: "MASCULINO",
      debtorsOnly: false,
      appointmentDate: "",
      sortOrder: "asc"
    });

    expect(results.map((patient) => patient.fullName)).toEqual(["Carlos Núñez"]);
  });

  it("filters patients with pending balance", () => {
    const results = filterPatientDirectory(directoryPatients, {
      query: "",
      genderFilter: "ALL",
      debtorsOnly: true,
      appointmentDate: "",
      sortOrder: "asc"
    });

    expect(results.map((patient) => patient.fullName)).toEqual(["Ana Ruiz", "Carlos Núñez"]);
  });

  it("filters by next appointment date", () => {
    const results = filterPatientDirectory(directoryPatients, {
      query: "",
      genderFilter: "ALL",
      debtorsOnly: false,
      appointmentDate: "2026-08-24",
      sortOrder: "asc"
    });

    expect(results.map((patient) => patient.fullName)).toEqual(["Carlos Núñez", "María López"]);
  });

  it("combines search with directory filters", () => {
    const results = filterPatientDirectory(directoryPatients, {
      query: "55 2020",
      genderFilter: "FEMENINO",
      debtorsOnly: true,
      appointmentDate: "2026-08-25",
      sortOrder: "asc"
    });

    expect(results.map((patient) => patient.fullName)).toEqual(["Ana Ruiz"]);
  });
});
