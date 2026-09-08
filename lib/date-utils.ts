export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function startOfWeek(date: Date): Date {
  const copy = fromDateKey(toDateKey(date));
  const weekday = copy.getDay();
  const diff = -weekday;
  return addDays(copy, diff);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(date);
}

export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function formatWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat("es", { weekday: "short" }).format(date);
}

export function formatWeekdayLetter(date: Date): string {
  return formatWeekdayShort(date).replace(".", "").slice(0, 1);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(date);
}

export function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDatetimeLocal(value: string): Date {
  return new Date(value);
}