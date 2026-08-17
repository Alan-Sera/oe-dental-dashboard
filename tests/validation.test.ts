import { describe, expect, it } from "vitest";

import {
  importCandidateSchema,
  paymentSchema,
  patientSchema,
  treatmentChargeSchema
} from "@/lib/validation";

describe("validation", () => {
  it("accepts a minimal patient", () => {
    expect(patientSchema.safeParse({ fullName: "María López" }).success).toBe(true);
  });

  it("requires payment amount and method", () => {
    expect(
      paymentSchema.safeParse({
        patientId: "p1",
        amount: "1500",
        paidAt: "2026-08-15",
        method: "Transferencia",
        status: "CONFIRMED"
      }).success
    ).toBe(true);
  });

  it("rejects empty treatment descriptions", () => {
    expect(
      treatmentChargeSchema.safeParse({
        patientId: "p1",
        description: "",
        amount: "100",
        serviceDate: "2026-08-15",
        status: "OPEN"
      }).success
    ).toBe(false);
  });

  it("accepts payment history import candidates", () => {
    expect(
      importCandidateSchema.safeParse({
        candidateId: "c1",
        patientName: "Ana Ruiz",
        category: "PAYMENT_HISTORY",
        originalName: "estado-cuenta.xlsx",
        sourceRelativePath: "Ana Ruiz/historial pagos/estado-cuenta.xlsx",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }).success
    ).toBe(true);
  });
});
