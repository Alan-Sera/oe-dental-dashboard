import { describe, expect, it } from "vitest";

import {
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
});
