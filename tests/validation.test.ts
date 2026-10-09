import { describe, expect, it } from "vitest";

import {
  importCandidateSchema,
  paymentSchema,
  patientSchema,
  treatmentChargeSchema
} from "@/lib/validation";

describe("validation", () => {
  it("accepts a minimal patient", () => {
    expect(
      patientSchema.safeParse({ fullName: "María López", phoneUnavailable: true }).success
    ).toBe(true);
  });

  it("accepts patient directory fields", () => {
    expect(
      patientSchema.safeParse({
        fullName: "Ana Ruiz",
        phone: "983 123 4567",
        gender: "FEMENINO",
        nextAppointmentDate: "2026-08-24"
      }).success
    ).toBe(true);
  });

  it("rejects letters and separator-only phone values but accepts legacy formatting", () => {
    expect(
      patientSchema.safeParse({ fullName: "Ana Ruiz", phone: "983 ABC 4567" }).success
    ).toBe(false);
    expect(
      patientSchema.safeParse({ fullName: "Ana Ruiz", phone: "---" }).success
    ).toBe(false);
    expect(
      patientSchema.safeParse({ fullName: "Ana Ruiz", phone: "+52 (983) 123-4567" }).success
    ).toBe(true);
  });

  it("rejects unsupported patient gender values", () => {
    expect(
      patientSchema.safeParse({
        fullName: "Carlos Núñez",
        phoneUnavailable: true,
        gender: "OTRO"
      }).success
    ).toBe(false);
  });

  it("requires phone or an explicit unavailable confirmation", () => {
    expect(patientSchema.safeParse({ fullName: "Ana Ruiz" }).success).toBe(false);
    expect(patientSchema.safeParse({ fullName: "Ana Ruiz", phoneUnavailable: true }).success).toBe(true);
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
        localRelativePath: "historial pagos/estado-cuenta.xlsx",
        sourceRelativePath: "Ana Ruiz/historial pagos/estado-cuenta.xlsx",
        sizeBytes: 1024,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }).success
    ).toBe(true);
  });
});
