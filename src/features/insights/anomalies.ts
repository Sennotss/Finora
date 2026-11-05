/**
 * Transparent statistical anomaly detection. Results are framed as "unusual" — they
 * highlight things worth a second look and never imply fraud.
 */
import type Decimal from "decimal.js";
import type { Converter } from "@/lib/currency";
import { diffInDays, monthKey } from "@/lib/dates";
import { D, ZERO, percentChange } from "@/lib/money";
import { countsAsCashFlow } from "@/features/analytics/calculations";
import type { LedgerTx } from "@/features/finance/types";
import { normalizeDescription } from "./categorize";

export type Anomaly = {
  id: string;
  kind: "large_transaction" | "category_spike" | "untracked_recurring" | "price_increase" | "spending_pace";
  severity: "info" | "warning";
  title: string;
  detail: string;
  /** How the anomaly was detected, shown to the user for transparency. */
  method: string;
  transactionId?: string;
  categoryId?: string | null;
  amount?: string;
};

export function median(values: Decimal[]): Decimal {
  if (values.length === 0) return ZERO;
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : sorted[mid - 1].plus(sorted[mid]).div(2);
}

/** Median absolute deviation. */
export function mad(values: Decimal[], med = median(values)): Decimal {
  return median(values.map((v) => v.minus(med).abs()));
}

/**
 * Modified z-score (Iglewicz & Hoaglin): 0.6745 × (x − median) / MAD.
 * Robust to the outliers we are trying to find, unlike mean/standard deviation.
 */
export function modifiedZScore(value: Decimal, med: Decimal, deviation: Decimal): Decimal | null {
  if (deviation.isZero()) return null;
  return D("0.6745").times(value.minus(med)).div(deviation);
}

export const MIN_SAMPLE = 6;
export const Z_THRESHOLD = 3.5;

/**
 * Flags recent expenses far above what is typical for their category.
 * `history` must not include the `recent` transactions.
 */
export function detectLargeTransactions(
  recent: LedgerTx[],
  history: LedgerTx[],
  converter: Converter,
  categoryName: (id: string | null) => string,
): Anomaly[] {
  const toBase = (t: LedgerTx) => converter.toBase(t.amount, t.currency);
  const groups = new Map<string, Decimal[]>();
  const all: Decimal[] = [];
  for (const t of history) {
    if (!countsAsCashFlow(t) || t.type !== "EXPENSE") continue;
    const v = toBase(t);
    if (!v) continue;
    all.push(v);
    const key = t.categoryId ?? "__none__";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  const out: Anomaly[] = [];
  for (const t of recent) {
    if (!countsAsCashFlow(t) || t.type !== "EXPENSE") continue;
    const v = toBase(t);
    if (!v) continue;
    let sample = groups.get(t.categoryId ?? "__none__") ?? [];
    let scope = `other ${categoryName(t.categoryId)} expenses`;
    if (sample.length < MIN_SAMPLE) {
      sample = all;
      scope = "your other expenses";
    }
    if (sample.length < MIN_SAMPLE) continue;
    const med = median(sample);
    const deviation = mad(sample, med);
    const z = modifiedZScore(v, med, deviation);
    // With zero spread, fall back to a simple ratio test.
    const unusual = z === null ? v.greaterThan(med.times(3)) : z.greaterThan(Z_THRESHOLD) && v.greaterThan(med.times(2));
    if (!unusual) continue;
    const ratio = med.isZero() ? null : v.div(med);
    out.push({
      id: `large:${t.id}`,
      kind: "large_transaction",
      severity: "warning",
      title: `Unusually large expense: ${t.description}`,
      detail: ratio ? `About ${ratio.toDecimalPlaces(1).toString()}× the typical amount for ${scope}.` : `Well above ${scope}.`,
      method: `Modified z-score ${z ? z.toDecimalPlaces(1).toString() : "n/a"} vs. median of ${sample.length} past transactions (threshold ${Z_THRESHOLD}).`,
      transactionId: t.id,
      categoryId: t.categoryId,
      amount: v.toFixed(),
    });
  }
  return out;
}

/**
 * Categories whose spending this month is well above their recent monthly average.
 * Requires a meaningful absolute increase so tiny categories don't trigger alerts.
 */
export function detectCategorySpikes(
  current: Map<string | null, Decimal>,
  priorMonths: Array<Map<string | null, Decimal>>,
  categoryName: (id: string | null) => string,
  minAbsoluteIncrease: Decimal,
  thresholdPct = 50,
): Anomaly[] {
  if (priorMonths.length < 2) return [];
  const out: Anomaly[] = [];
  for (const [categoryId, amount] of current) {
    const priorValues = priorMonths.map((m) => m.get(categoryId) ?? ZERO);
    const avg = priorValues.reduce((a, v) => a.plus(v), ZERO).div(priorValues.length);
    if (avg.isZero()) continue;
    const change = percentChange(amount, avg);
    if (!change || change.lessThan(thresholdPct) || amount.minus(avg).lessThan(minAbsoluteIncrease)) continue;
    out.push({
      id: `spike:${categoryId ?? "none"}`,
      kind: "category_spike",
      severity: change.greaterThan(100) ? "warning" : "info",
      title: `${categoryName(categoryId)} spending is up ${change.toDecimalPlaces(0).toString()}%`,
      detail: `Compared with your ${priorMonths.length}-month average for this category.`,
      method: `This month vs. mean of the previous ${priorMonths.length} months (flagged above +${thresholdPct}%).`,
      categoryId,
      amount: amount.toFixed(),
    });
  }
  return out;
}

export type RecurringPattern = {
  key: string;
  description: string;
  occurrences: number;
  averageAmount: Decimal;
  lastAmount: Decimal;
  previousAmount: Decimal;
  lastDate: Date;
  medianIntervalDays: number;
  tracked: boolean;
};

/**
 * Finds expenses that repeat roughly monthly with a stable amount (likely subscriptions).
 * Groups by normalised description; requires ≥3 occurrences in distinct months, a
 * median gap of 25–35 days and a coefficient of variation under 20%.
 */
export function findRecurringPatterns(txs: LedgerTx[], converter: Converter): RecurringPattern[] {
  const groups = new Map<string, LedgerTx[]>();
  for (const t of txs) {
    if (!countsAsCashFlow(t) || t.type !== "EXPENSE") continue;
    const key = normalizeDescription(t.description);
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const patterns: RecurringPattern[] = [];
  for (const [key, items] of groups) {
    if (items.length < 3) continue;
    const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (new Set(sorted.map((t) => monthKey(t.date))).size < 3) continue;
    const amounts = sorted.map((t) => converter.toBase(t.amount, t.currency)).filter((v): v is Decimal => v !== null);
    if (amounts.length < 3) continue;
    const gaps = sorted.slice(1).map((t, i) => diffInDays(sorted[i].date, t.date));
    const medianGap = median(gaps.map((g) => D(g))).toNumber();
    if (medianGap < 25 || medianGap > 35) continue;
    const avg = amounts.reduce((a, v) => a.plus(v), ZERO).div(amounts.length);
    const variance = amounts.reduce((a, v) => a.plus(v.minus(avg).pow(2)), ZERO).div(amounts.length);
    const cv = avg.isZero() ? D(0) : variance.sqrt().div(avg);
    if (cv.greaterThan("0.2")) continue;
    patterns.push({
      key,
      description: sorted[sorted.length - 1].description,
      occurrences: sorted.length,
      averageAmount: avg,
      lastAmount: amounts[amounts.length - 1],
      previousAmount: amounts[amounts.length - 2],
      lastDate: sorted[sorted.length - 1].date,
      medianIntervalDays: medianGap,
      tracked: sorted.some((t) => t.isScheduled),
    });
  }
  return patterns.sort((a, b) => b.averageAmount.comparedTo(a.averageAmount));
}

export function detectRecurringAnomalies(patterns: RecurringPattern[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const p of patterns) {
    if (!p.tracked) {
      out.push({
        id: `untracked:${p.key}`,
        kind: "untracked_recurring",
        severity: "info",
        title: `Possible recurring charge: ${p.description}`,
        detail: `Charged ${p.occurrences} times about every ${Math.round(p.medianIntervalDays)} days. Consider adding it to Bills & Subscriptions.`,
        method: "Same description, stable amount (variation < 20%) and ~monthly spacing.",
        amount: p.averageAmount.toFixed(),
      });
    }
    const change = percentChange(p.lastAmount, p.previousAmount);
    if (change && change.greaterThanOrEqualTo(10)) {
      out.push({
        id: `price:${p.key}`,
        kind: "price_increase",
        severity: "warning",
        title: `${p.description} cost went up ${change.toDecimalPlaces(0).toString()}%`,
        detail: "The latest charge is higher than the previous one.",
        method: "Latest vs. previous charge of a detected recurring expense (flagged at +10%).",
        amount: p.lastAmount.toFixed(),
      });
    }
  }
  return out;
}

/** Month-to-date daily spending pace vs. the average daily pace of previous months. */
export function detectSpendingPace(currentDaily: Decimal, priorDaily: Decimal, elapsedDays: number, thresholdPct = 30): Anomaly[] {
  if (elapsedDays < 7 || priorDaily.isZero()) return [];
  const change = percentChange(currentDaily, priorDaily);
  if (!change || change.lessThan(thresholdPct)) return [];
  return [
    {
      id: "pace",
      kind: "spending_pace",
      severity: "warning",
      title: `You're spending ${change.toDecimalPlaces(0).toString()}% faster than usual`,
      detail: "Your average daily spending this month is above your recent monthly average.",
      method: `Month-to-date average per day vs. the previous months' average per day (flagged above +${thresholdPct}%, after 7+ days).`,
    },
  ];
}
