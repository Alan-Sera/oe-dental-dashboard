import type { ChargeStatus, PaymentStatus } from "@prisma/client";

export type LedgerCharge = {
  amountCents: number;
  status: ChargeStatus;
};

export type LedgerPayment = {
  amountCents: number;
  status: PaymentStatus;
};

export function calculateLedgerTotals(charges: LedgerCharge[], payments: LedgerPayment[]) {
  const openCharges = charges
    .filter((charge) => charge.status !== "VOID")
    .reduce((total, charge) => total + charge.amountCents, 0);

  const confirmedPayments = payments
    .filter((payment) => payment.status === "CONFIRMED")
    .reduce((total, payment) => total + payment.amountCents, 0);

  return {
    chargeTotalCents: openCharges,
    paymentTotalCents: confirmedPayments,
    balanceCents: openCharges - confirmedPayments
  };
}
