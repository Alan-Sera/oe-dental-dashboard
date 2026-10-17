import { describe, expect, it } from "vitest";

import { getUpcomingAppointmentWhere, UPCOMING_APPOINTMENT_STATUSES } from "@/lib/upcoming-appointments";

describe("upcoming appointment query", () => {
  it("uses positive statuses to keep relation queries batchable in SQLite", () => {
    const asOf = new Date("2026-10-17T12:00:00.000Z");

    expect(getUpcomingAppointmentWhere(asOf)).toEqual({
      startTime: { gte: asOf },
      status: { in: ["SCHEDULED", "CONFIRMED", "COMPLETED"] }
    });
    expect(UPCOMING_APPOINTMENT_STATUSES).not.toContain("CANCELLED");
    expect(UPCOMING_APPOINTMENT_STATUSES).not.toContain("NO_SHOW");
  });
});
