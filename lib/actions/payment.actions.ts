"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/actions/audit.actions";
import { getClinicSettings } from "@/lib/actions/settings.actions";
import { calculateLedgerTotals } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { parseMoneyToCents } from "@/lib/utils";
import {
  paymentSchema,
  treatmentChargeSchema,
  type PaymentInput,
  type TreatmentChargeInput
} from "@/lib/validation";

export async function createTreatmentCharge(input: TreatmentChargeInput) {
  const parsed = treatmentChargeSchema.parse(input);
  const settings = await getClinicSettings();

  const charge = await prisma.treatmentCharge.create({
    data: {
      patientId: parsed.patientId,
      description: parsed.description,
      amountCents: parseMoneyToCents(parsed.amount),
      currency: settings.currency,
      serviceDate: new Date(parsed.serviceDate),
      status: parsed.status,
      notes: parsed.notes || null
    }
  });

  await recordAudit("charge.created", "TreatmentCharge", charge.id, {
    patientId: parsed.patientId
  });
  revalidatePath(`/patients/${parsed.patientId}`);
  revalidatePath("/dashboard");

  return charge;
}

export async function recordPayment(input: PaymentInput) {
  const parsed = paymentSchema.parse(input);
  const settings = await getClinicSettings();

  const payment = await prisma.payment.create({
    data: {
      patientId: parsed.patientId,
      amountCents: parseMoneyToCents(parsed.amount),
      currency: settings.currency,
      paidAt: new Date(parsed.paidAt),
      method: parsed.method,
      status: parsed.status,
      notes: parsed.notes || null
    }
  });

  await recordAudit("payment.created", "Payment", payment.id, {
    patientId: parsed.patientId
  });
  revalidatePath(`/patients/${parsed.patientId}`);
  revalidatePath("/dashboard");

  return payment;
}

export async function getPatientLedger(patientId: string) {
  const [charges, payments] = await Promise.all([
    prisma.treatmentCharge.findMany({
      where: { patientId },
      orderBy: { serviceDate: "desc" }
    }),
    prisma.payment.findMany({
      where: { patientId },
      orderBy: { paidAt: "desc" }
    })
  ]);

  return {
    charges,
    payments,
    totals: calculateLedgerTotals(charges, payments)
  };
}
