import { describe, expect, it } from "vitest";

import {
  filterPatientsByQuery,
  getPatientSuggestions,
  normalizePhoneSearch,
  normalizeSearchText
} from "@/lib/patient-search";

const patients = [
  { fullName: "María López", phone: "(998) 123-4567" },
  { fullName: "Ana Ruiz", phone: "55 2020 3030" },
  { fullName: "Carlos Núñez", phone: null }
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
});
