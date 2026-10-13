"use client";

import * as React from "react";
import { addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter } from "@/components/ui/card"

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function CalendarWithPresets({
  selectedDay,
  onSelect,
  disabled = false
}: {
  selectedDay: Date;
  onSelect: (day: Date) => void;
  disabled?: boolean;
}) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => startOfMonth(selectedDay));

  React.useEffect(() => {
    setCurrentMonth(startOfMonth(selectedDay));
  }, [selectedDay]);

  function pick(date: Date) {
    onSelect(startOfDay(date));
    setCurrentMonth(startOfMonth(date));
  }

  const today = startOfDay(new Date());
  const selectedDayStart = startOfDay(selectedDay);

  return (
    <Card className="mx-auto px-1 w-fit max-w-[300px]" size="sm">
      <CardContent>
        <Calendar
          mode="single"
          selected={selectedDay}
          onSelect={(day) => {
            if (day) pick(day);
          }}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          fixedWeeks
          disabled={disabled}
          className="p-0"
        />
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t px-1">
        {[
          { label: "Hoy", date: today },
          { label: "En 1 semana", date: addDays(today, 7) },
          { label: "En 2 semanas", date: addDays(today, 14) },
          { label: "En 3 semanas", date: addDays(today, 21) },
          { label: "Próximo mes", date: addDays(today, 28) }
        ].map((preset) => {
          const isSelected = preset.date.getTime() === selectedDayStart.getTime();

          return (
            <Button
              key={preset.label}
              variant={isSelected ? "primary" : "secondary"}
              size="sm"
              className="flex-1 px-5"
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => pick(preset.date)}
            >
              {preset.label}
            </Button>
          );
        })}
      </CardFooter>
    </Card>
  );
}
