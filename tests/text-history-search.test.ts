import { describe, expect, it } from "vitest";

import {
  getTextHistoryHighlightSegments,
  getTextHistorySearchSummary,
  normalizeTextHistorySearchText,
  textHistoryValueMatches,
} from "@/lib/text-history-search";
import { parseLinkedTextHistory } from "@/lib/text-history-parser";

describe("text history search", () => {
  it("normalizes accents and case", () => {
    expect(normalizeTextHistorySearchText("  REVISIÓN ÁNGULO  ")).toBe(
      "revision angulo",
    );
  });

  it("matches partial keywords without accents", () => {
    expect(textHistoryValueMatches("Se presenta a revisión", "visi")).toBe(
      true,
    );
    expect(textHistoryValueMatches("Ortodoncia activa", "endo")).toBe(false);
  });

  it("builds highlight segments without changing the original text", () => {
    expect(getTextHistoryHighlightSegments("María López", "maria")).toEqual([
      { text: "María", highlighted: true },
      { text: " López", highlighted: false },
    ]);
  });

  it("counts matches in information, appointment body, date, and NEXT", () => {
    const history = parseLinkedTextHistory(
      [
        "ALERGIA PENICILINA",
        "",
        "10-JUL-26 Limpieza profunda",
        "          NEXT: revisar limpieza",
      ].join("\n"),
    );

    expect(getTextHistorySearchSummary(history, "penicilina")).toMatchObject({
      informationMatches: 1,
      totalMatches: 1,
    });

    expect(getTextHistorySearchSummary(history, "limpieza")).toMatchObject({
      informationMatches: 0,
      totalMatches: 2,
      appointmentMatches: [
        {
          index: 0,
          bodyMatches: 1,
          nextMatches: 1,
        },
      ],
    });

    expect(getTextHistorySearchSummary(history, "2026-07")).toMatchObject({
      totalMatches: 1,
      appointmentMatches: [
        {
          index: 0,
          normalizedDateMatches: 1,
        },
      ],
    });
  });
});
