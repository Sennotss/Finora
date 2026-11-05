import type Decimal from "decimal.js";
import type { Converter } from "@/lib/currency";
import { addDays, addMonths, diffInDays, diffInMonths, periodProgress, type DateRange } from "@/lib/dates";
import { D, ZERO, percentOf } from "@/lib/money";
import { countsAsCashFlow, filterRange } from "@/features/analytics/calculations";
import type { LedgerCategory, LedgerTx } from "@/features/finance/types";

export type BudgetPeriodValue = "WEEKLY" | "MONTHLY" | "ANNUAL" | "CUSTOM";

export type BudgetThresholds = { normal: number; moderate: number; warning: number };

export const DEFAULT_THRESHOLDS: BudgetThresholds = { normal: 50, moderate: 75, warning: 90 };

export type BudgetStatus = "healthy" | "normal" | "moderate" | "warning" | "reached" | "exceeded";

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  healthy: "On track",
  normal: "Normal",
  moderate: "Moderate",
  warning: "Approaching limit",
  reached: "Budget reached",
  exceeded: "Budget exceeded",
};

export function budgetStatus(percent: Decimal | null, thresholds: BudgetThresholds = DEFAULT_THRESHOLDS): BudgetStatus {
  if (percent === null) return "healthy";
  if (percent.greaterThan(100)) return "exceeded";
  if (percent.equals(100)) return "reached";
  if (percent.greaterThanOrEqualTo(thresholds.warning)) return "warning";
  if (percent.greaterThanOrEqualTo(thresholds.moderate)) return "moderate";
  if (percent.greaterThanOrEqualTo(thresholds.normal)) return "normal";
  return "healthy";
}

/**
 * The budget period that contains `today`. Recurring budgets repeat from their start date
 * (a monthly budget starting on the 1st follows calendar months; one starting on the 25th
 * runs 25th → 24th). Before the start date, the first period is returned.
 */
export function budgetPeriodRange(
  budget: { period: BudgetPeriodValue; startDate: Date; endDate: Date | null },
  today: Date,
): DateRange {
  const { startDate } = budget;
  switch (budget.period) {
    case "CUSTOM":
      return { start: startDate, end: budget.endDate ?? startDate };
    case "WEEKLY": {
      const k = Math.max(0, Math.floor(diffInDays(startDate, today) / 7));
      const start = addDays(startDate, 7 * k);
      return { start, end: addDays(start, 6) };
    }
    case "MONTHLY":
    case "ANNUAL": {
      const step = budget.period === "MONTHLY" ? 1 : 12;
      const anchor = startDate.getUTCDate();
      let k = Math.max(0, Math.floor(diffInMonths(startDate, today) / step));
      let start = addMonths(startDate, k * step, anchor);
      if (start.getTime() > today.getTime() && k > 0) {
        k -= 1;
        start = addMonths(startDate, k * step, anchor);
      }
      const end = addDays(addMonths(startDate, (k + 1) * step, anchor), -1);
      return { start, end };
    }
  }
}

export type BudgetEvaluation = {
  limit: Decimal;
  spent: Decimal;
  remaining: Decimal;
  /** Share of the limit used, 0–100+ (null when the limit is zero). */
  percent: Decimal | null;
  /** Straight-line projection of spending to the end of the period. */
  projected: Decimal;
  projectedPercent: Decimal | null;
  /** How much can be spent per remaining day to stay within the limit. */
  dailyAllowance: Decimal | null;
  status: BudgetStatus;
  projectedStatus: BudgetStatus;
  elapsedDays: number;
  totalDays: number;
};

export function evaluateBudget(
  limit: Decimal,
  spent: Decimal,
  range: DateRange,
  today: Date,
  thresholds: BudgetThresholds = DEFAULT_THRESHOLDS,
): BudgetEvaluation {
  const { elapsedDays, totalDays } = periodProgress(range, today);
  const percent = percentOf(spent, limit);
  // Before the period starts nothing can be projected; after it ends, actual = projected.
  const projected = elapsedDays === 0 ? spent : spent.div(elapsedDays).times(totalDays);
  const projectedPercent = percentOf(projected, limit);
  const remaining = limit.minus(spent);
  // Days left including today; zero once the period has ended.
  const remainingDays =
    today.getTime() > range.end.getTime() ? 0 : today.getTime() < range.start.getTime() ? totalDays : diffInDays(today, range.end) + 1;
  const dailyAllowance = remainingDays > 0 ? (remaining.greaterThan(0) ? remaining.div(remainingDays) : ZERO) : null;
  return {
    limit,
    spent,
    remaining,
    percent,
    projected,
    projectedPercent,
    dailyAllowance,
    status: budgetStatus(percent, thresholds),
    projectedStatus: budgetStatus(projectedPercent, thresholds),
    elapsedDays,
    totalDays,
  };
}

export type BudgetLine = { categoryId: string; amount: Decimal };

/**
 * Spending attributed to a budget within `range`.
 * - No lines: every expense counts.
 * - A line for a parent category includes its subcategories.
 * - A line for a subcategory counts only that subcategory.
 * Each transaction counts once toward the budget total even if it matches several lines.
 */
export function budgetSpending(
  lines: BudgetLine[],
  txs: LedgerTx[],
  categories: Pick<LedgerCategory, "id" | "parentId">[],
  range: DateRange,
  converter: Converter,
): { total: Decimal; byCategory: Map<string, Decimal> } {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const lineIds = new Set(lines.map((l) => l.categoryId));
  const byCategory = new Map<string, Decimal>(lines.map((l) => [l.categoryId, ZERO]));
  let total = ZERO;

  for (const tx of filterRange(txs, range)) {
    if (!countsAsCashFlow(tx) || tx.type !== "EXPENSE") continue;
    const base = converter.toBase(tx.amount, tx.currency);
    if (base === null) continue;
    if (lineIds.size === 0) {
      total = total.plus(base);
      continue;
    }
    const cat = tx.categoryId;
    if (!cat) continue;
    const parent = parentOf.get(cat) ?? null;
    let matched = false;
    if (lineIds.has(cat)) {
      byCategory.set(cat, byCategory.get(cat)!.plus(base));
      matched = true;
    }
    if (parent && lineIds.has(parent)) {
      byCategory.set(parent, byCategory.get(parent)!.plus(base));
      matched = true;
    }
    if (matched) total = total.plus(base);
  }
  return { total, byCategory };
}

export function sumLines(lines: BudgetLine[]): Decimal {
  return lines.reduce((acc, l) => acc.plus(D(l.amount)), ZERO);
}
