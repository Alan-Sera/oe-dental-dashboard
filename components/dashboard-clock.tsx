"use client";

import { useEffect, useState } from "react";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export function DashboardClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();

    const intervalId = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const dateLabel = now ? dateFormatter.format(now) : "— --- ----";
  const timeLabel = now ? timeFormatter.format(now) : "--:--:--";

  return (
    <div
      role="timer"
      aria-label="Fecha y hora actual"
      className={`flex items-baseline justify-center gap-x-3 whitespace-nowrap text-center sm:gap-x-5 ${className ?? ""}`}
    >
      <time dateTime={now?.toISOString()} className="font-mono text-2xl tabular-nums tracking-tight text-theme-strong sm:text-3xl">
        {dateLabel}
      </time>
      <time
        dateTime={now?.toISOString()}
        className="font-mono text-2xl font-semibold tabular-nums tracking-wide text-theme-strong sm:text-3xl"
      >
        {timeLabel}
      </time>
    </div>
  );
}
