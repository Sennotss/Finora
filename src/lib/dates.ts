/**
 * Date-only helpers.
 *
 * Every calendar date in Finora is a UTC-midnight `Date` (matching Postgres `DATE`).
 * Ranges are inclusive on both ends: { start: 2026-10-01, end: 2026-10-31 }.
 * "Today" is resolved in the user's timezone, then treated as a date-only value,
 * so period boundaries are identical on the server, the client and in the database.
 */

export type DateRange = { start: Date; end: Date };

const DAY_MS = 86_400_000;

export function dateOnly(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [, y, m, d] = match;
  const date = dateOnly(Number(y), Number(m) - 1, Number(d));
  if (date.getUTCMonth() !== Number(m) - 1) throw new Error(`Invalid date: ${value}`);
  return date;
}

export function isValidDateString(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function toDateOnly(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function todayInTimeZone(timeZone = "UTC", now: Date = new Date()): Date {
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    formatted = now.toISOString().slice(0, 10);
  }
  return parseDateOnly(formatted);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Adds months, clamping to the last day when the target month is shorter. */
export function addMonths(date: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? date.getUTCDate();
  const targetMonth = date.getUTCMonth() + months;
  const firstOfTarget = dateOnly(date.getUTCFullYear(), targetMonth, 1);
  const lastDay = daysInMonth(firstOfTarget);
  return dateOnly(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(day, lastDay));
}

export function daysInMonth(date: Date): number {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).getUTCDate();
}

export function startOfMonth(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
}

export function startOfYear(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), 0, 1);
}

export function endOfYear(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), 11, 31);
}

export function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const diff = (date.getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(toDateOnly(date), -diff);
}

export function endOfWeek(date: Date, weekStartsOn = 1): Date {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

/** Whole days from a to b (b - a). */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((toDateOnly(b).getTime() - toDateOnly(a).getTime()) / DAY_MS);
}

/** Number of calendar days in an inclusive range. */
export function rangeLengthInDays(range: DateRange): number {
  return diffInDays(range.start, range.end) + 1;
}

export function diffInMonths(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

export function isWithin(date: Date, range: DateRange): boolean {
  const t = date.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

export function eachDay(range: DateRange): Date[] {
  const days: Date[] = [];
  for (let d = range.start; d.getTime() <= range.end.getTime(); d = addDays(d, 1)) days.push(d);
  return days;
}

export function eachMonthStart(range: DateRange): Date[] {
  const months: Date[] = [];
  for (let d = startOfMonth(range.start); d.getTime() <= range.end.getTime(); d = addMonths(d, 1, 1)) months.push(d);
  return months;
}

export function lastNMonths(today: Date, n: number): DateRange {
  return { start: startOfMonth(addMonths(today, -(n - 1), 1)), end: endOfMonth(today) };
}

export const PERIOD_PRESETS = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "this_year",
  "last_12_months",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  this_year: "This year",
  last_12_months: "Last 12 months",
  custom: "Custom range",
};

export type ResolvedPeriod = {
  preset: PeriodPreset;
  range: DateRange;
  /** Equal-length range immediately before `range`, used for comparisons. */
  previous: DateRange;
  label: string;
};

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return typeof value === "string" && (PERIOD_PRESETS as readonly string[]).includes(value);
}

export function resolvePeriod(
  preset: PeriodPreset,
  today: Date,
  options: { weekStartsOn?: number; from?: string; to?: string } = {},
): ResolvedPeriod {
  const weekStartsOn = options.weekStartsOn ?? 1;
  let range: DateRange;
  let previous: DateRange;

  switch (preset) {
    case "today":
      range = { start: today, end: today };
      previous = { start: addDays(today, -1), end: addDays(today, -1) };
      break;
    case "this_week": {
      const start = startOfWeek(today, weekStartsOn);
      range = { start, end: addDays(start, 6) };
      previous = { start: addDays(start, -7), end: addDays(start, -1) };
      break;
    }
    case "this_month":
      range = { start: startOfMonth(today), end: endOfMonth(today) };
      previous = { start: startOfMonth(addMonths(today, -1, 1)), end: endOfMonth(addMonths(today, -1, 1)) };
      break;
    case "last_month": {
      const last = addMonths(startOfMonth(today), -1, 1);
      range = { start: last, end: endOfMonth(last) };
      const prior = addMonths(last, -1, 1);
      previous = { start: prior, end: endOfMonth(prior) };
      break;
    }
    case "last_3_months":
    case "last_6_months":
    case "last_12_months": {
      const n = preset === "last_3_months" ? 3 : preset === "last_6_months" ? 6 : 12;
      range = lastNMonths(today, n);
      previous = { start: addMonths(range.start, -n, 1), end: addDays(range.start, -1) };
      break;
    }
    case "this_year":
      range = { start: startOfYear(today), end: endOfYear(today) };
      previous = { start: dateOnly(today.getUTCFullYear() - 1, 0, 1), end: dateOnly(today.getUTCFullYear() - 1, 11, 31) };
      break;
    case "custom": {
      const from = options.from && isValidDateString(options.from) ? parseDateOnly(options.from) : startOfMonth(today);
      const to = options.to && isValidDateString(options.to) ? parseDateOnly(options.to) : today;
      const start = minDate(from, to);
      const end = maxDate(from, to);
      const length = rangeLengthInDays({ start, end });
      range = { start, end };
      previous = { start: addDays(start, -length), end: addDays(start, -1) };
      break;
    }
  }

  return { preset, range, previous, label: preset === "custom" ? formatRangeLabel(range) : PERIOD_LABELS[preset] };
}

/** For "current" periods, days elapsed so far (inclusive of today) and total days. */
export function periodProgress(range: DateRange, today: Date): { elapsedDays: number; totalDays: number } {
  const totalDays = rangeLengthInDays(range);
  if (today.getTime() < range.start.getTime()) return { elapsedDays: 0, totalDays };
  if (today.getTime() > range.end.getTime()) return { elapsedDays: totalDays, totalDays };
  return { elapsedDays: diffInDays(range.start, today) + 1, totalDays };
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateNoYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function formatDisplayDate(date: Date | string, withYear = true): string {
  const d = typeof date === "string" ? parseDateOnly(date) : date;
  return (withYear ? shortDate : shortDateNoYear).format(d);
}

export function formatMonth(date: Date | string, long = false): string {
  const d = typeof date === "string" ? parseDateOnly(date.length === 7 ? `${date}-01` : date) : date;
  return (long ? monthLong : monthYear).format(d);
}

export function formatRangeLabel(range: DateRange): string {
  if (range.start.getTime() === range.end.getTime()) return formatDisplayDate(range.start);
  const sameYear = range.start.getUTCFullYear() === range.end.getUTCFullYear();
  return `${formatDisplayDate(range.start, !sameYear)} – ${formatDisplayDate(range.end)}`;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
