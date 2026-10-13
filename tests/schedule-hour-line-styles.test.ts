import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayView } from "../components/schedule/day-view";
import { WeekView } from "../components/schedule/week-view";
import { WORKDAY_END_HOUR, WORKDAY_START_HOUR } from "../components/schedule/constants";

const hourlyLineCount = WORKDAY_END_HOUR - WORKDAY_START_HOUR + 1;

describe("schedule hourly line styles", () => {
  it("uses the emphasized 09:00 style for every line in the day view", () => {
    const markup = renderToStaticMarkup(
      createElement(DayView, {
        dateKey: "2026-10-12",
        appointments: [],
        onCreateAt: () => undefined,
        onEdit: () => undefined,
      }),
    );

    expect(
      markup.match(/absolute inset-x-0 border-t border-lavender-500\/45/g),
    ).toHaveLength(hourlyLineCount);
    expect(markup).not.toContain("border-lavender-600/40");
  });

  it("keeps the existing lighter hourly line style in the week view", () => {
    const markup = renderToStaticMarkup(
      createElement(WeekView, {
        dateKey: "2026-10-12",
        appointments: [],
        onCreateAt: () => undefined,
        onEdit: () => undefined,
        onSelectDay: () => undefined,
      }),
    );

    expect(
      markup.match(/absolute inset-x-0 border-t border-lavender-600\/40/g),
    ).toHaveLength(hourlyLineCount * 7);
    expect(markup).not.toContain("absolute inset-x-0 border-t border-lavender-500/45");
  });
});
