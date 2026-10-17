import { describe, expect, it } from "vitest";

import { buildAgendaAdoptionUrl } from "@/lib/agenda-adoption-navigation";
import { toDateKey } from "@/lib/date-utils";

describe("buildAgendaAdoptionUrl", () => {
  it("abre Agenda en el día del evento e incluye solo el ID codificado", () => {
    const eventStart = new Date(2026, 9, 12, 15, 30);
    const eventId = "google/event + id";
    const url = buildAgendaAdoptionUrl({ eventId, startTime: eventStart.toISOString() });
    const parsedUrl = new URL(url, "http://localhost");

    expect(parsedUrl.pathname).toBe("/agenda");
    expect(parsedUrl.searchParams.get("view")).toBe("day");
    expect(parsedUrl.searchParams.get("date")).toBe(toDateKey(eventStart));
    expect(parsedUrl.searchParams.get("adopt")).toBe(eventId);
    expect(url).toContain(encodeURIComponent(eventId));
    expect([...parsedUrl.searchParams.keys()]).toEqual(["view", "date", "adopt"]);
  });
});
