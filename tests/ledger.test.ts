import { describe, expect, it } from "vitest";

import { calculateLedgerTotals } from "@/lib/ledger";

describe("ledger", () => {
  it("calculates balances from non-void charges and confirmed payments", () => {
    const totals = calculateLedgerTotals(
      [
        { amountCents: 50000, status: "OPEN" },
        { amountCents: 25000, status: "PAID" },
        { amountCents: 90000, status: "VOID" }
      ],
      [
        { amountCents: 30000, status: "CONFIRMED" },
        { amountCents: 15000, status: "PENDING" }
      ]
    );

    expect(totals).toEqual({
      chargeTotalCents: 75000,
      paymentTotalCents: 30000,
      balanceCents: 45000
    });
  });
});
