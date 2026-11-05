import { addDays, addMonths, type DateRange } from "./dates";
import { D, type MoneyLike } from "./money";
import type Decimal from "decimal.js";

export type FrequencyValue = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "CUSTOM";

export type RecurrenceRule = {
  frequency: FrequencyValue;
  /** Every N units. For CUSTOM the unit is days. */
  interval: number;
  /** Day-of-month anchor for month-based rules (keeps "31st" stable across short months). */
  anchorDay?: number;
};

export const FREQUENCY_LABELS: Record<FrequencyValue, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
  CUSTOM: "Custom (every N days)",
};

export function describeRule(rule: RecurrenceRule): string {
  const n = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case "DAILY":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "WEEKLY":
      return n === 1 ? "Every week" : `Every ${n} weeks`;
    case "MONTHLY":
      return n === 1 ? "Every month" : `Every ${n} months`;
    case "QUARTERLY":
      return n === 1 ? "Every quarter" : `Every ${n} quarters`;
    case "ANNUALLY":
      return n === 1 ? "Every year" : `Every ${n} years`;
    case "CUSTOM":
      return `Every ${n} days`;
  }
}

export function nextOccurrence(date: Date, rule: RecurrenceRule): Date {
  const n = Math.max(1, Math.floor(rule.interval));
  switch (rule.frequency) {
    case "DAILY":
    case "CUSTOM":
      return addDays(date, n);
    case "WEEKLY":
      return addDays(date, 7 * n);
    case "MONTHLY":
      return addMonths(date, n, rule.anchorDay);
    case "QUARTERLY":
      return addMonths(date, 3 * n, rule.anchorDay);
    case "ANNUALLY":
      return addMonths(date, 12 * n, rule.anchorDay);
  }
}

/**
 * All occurrences of a rule that start at `first`, which fall on or before `until`
 * (and on or before `endDate` when set). Capped to protect against runaway loops.
 */
export function occurrencesUntil(first: Date, rule: RecurrenceRule, until: Date, endDate?: Date | null, cap = 1000): Date[] {
  const out: Date[] = [];
  const limit = endDate && endDate.getTime() < until.getTime() ? endDate : until;
  for (let d = first; d.getTime() <= limit.getTime() && out.length < cap; d = nextOccurrence(d, rule)) out.push(d);
  return out;
}

export function occurrencesInRange(first: Date, rule: RecurrenceRule, range: DateRange, endDate?: Date | null): Date[] {
  return occurrencesUntil(first, rule, range.end, endDate).filter((d) => d.getTime() >= range.start.getTime());
}

/** Average number of occurrences per month, used to normalise recurring amounts. */
export function occurrencesPerMonth(rule: RecurrenceRule): Decimal {
  const n = D(Math.max(1, rule.interval));
  switch (rule.frequency) {
    case "DAILY":
    case "CUSTOM":
      return D("30.436875").div(n); // average days per month (365.2425 / 12)
    case "WEEKLY":
      return D("4.348125").div(n); // 30.436875 / 7
    case "MONTHLY":
      return D(1).div(n);
    case "QUARTERLY":
      return D(1).div(n.times(3));
    case "ANNUALLY":
      return D(1).div(n.times(12));
  }
}

export function monthlyEquivalent(amount: MoneyLike, rule: RecurrenceRule): Decimal {
  return D(amount).times(occurrencesPerMonth(rule));
}
