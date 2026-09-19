"use client";

import * as React from "react";
import {
  DayPicker,
  useDayPicker,
  type DayPickerProps,
  type MonthCaptionProps
} from "react-day-picker";
import { es } from "react-day-picker/locale";

import { cn } from "@/lib/utils";

const navButtonClass =
  "inline-flex size-8 items-center justify-center rounded-md text-lavender-200/80 transition hover:bg-lavender-800/40 hover:text-lavender-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60 disabled:pointer-events-none disabled:opacity-40";

function ChevronLeftIcon() {
  return (
    <svg
      className="size-4"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="16 18.112 9.81111111 12 16 5.87733333 14.0888889 4 6 12 14.0888889 20" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="size-4"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="8 18.112 14.18888889 12 8 5.87733333 9.91111111 4 18 12 9.91111111 20" />
    </svg>
  );
}

function MonthCaptionWithNav(
  props: MonthCaptionProps & { children?: React.ReactNode }
) {
  const { calendarMonth, displayIndex, children, ...divProps } = props;
  void calendarMonth;
  void displayIndex;
  const { previousMonth, nextMonth, goToMonth, labels, dayPickerProps } =
    useDayPicker();
  const calendarDisabled = dayPickerProps.disabled === true;

  return (
    <div {...divProps}>
      <button
        type="button"
        className={navButtonClass}
        aria-label={labels.labelPrevious(previousMonth)}
        disabled={calendarDisabled || !previousMonth}
        onClick={() => {
          if (previousMonth) goToMonth(previousMonth);
        }}
      >
        <ChevronLeftIcon />
      </button>
      <span className="flex-1 text-center">{children}</span>
      <button
        type="button"
        className={navButtonClass}
        aria-label={labels.labelNext(nextMonth)}
        disabled={calendarDisabled || !nextMonth}
        onClick={() => {
          if (nextMonth) goToMonth(nextMonth);
        }}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      locale={es}
      hideNavigation
      weekStartsOn={0}
      components={{ MonthCaption: MonthCaptionWithNav }}
      className={cn("mx-auto w-fit", className)}
      classNames={{
        months: "flex flex-col",
        month: "flex flex-col",
        month_grid: "mx-auto border-collapse",
        month_caption: "flex items-center justify-between gap-1 px-1",
        caption_label: "text-sm font-semibold capitalize text-lavender-100",
        chevron: "size-4",
        weekday: "h-9 w-9 p-0 text-center align-middle text-xs text-lavender-200/50",
        day: "size-9 rounded-md p-0 text-center align-middle",
        day_button:
          "flex size-9 items-center justify-center rounded-md text-sm text-ink-100 transition hover:bg-lavender-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-200/60",
        selected: "bg-brand-600 font-semibold text-white hover:bg-brand-500",
        today:
          "font-bold [&>button]:underline [&>button]:decoration-brand-300/70 [&>button]:underline-offset-4",
        outside: "text-lavender-200/30",
        disabled: "opacity-40",
        hidden: "invisible",
        ...classNames
      }}
      {...props}
    />
  );
}
