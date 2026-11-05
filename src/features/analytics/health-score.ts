import type Decimal from "decimal.js";
import { D, ZERO, clampD } from "@/lib/money";

/**
 * A transparent, rules-based score from 0–100. Each indicator earns points on a linear
 * scale between a "zero points" and a "full points" level. Indicators without enough data
 * are left out and the score is rescaled over the remaining weight.
 *
 * This is an educational heuristic, not a professional financial assessment.
 */

export type HealthComponentKey = "savingRate" | "emergencyFund" | "debtToAsset" | "cashFlowStability" | "budgetAdherence";

export type HealthComponent = {
  key: HealthComponentKey;
  label: string;
  weight: number;
  /** Points earned, 0–weight. null when there is not enough data. */
  points: number | null;
  /** Human-readable measured value, e.g. "18.5%" or "2.3 months". */
  valueLabel: string;
  rule: string;
  tip: string;
};

export type HealthScore = {
  score: number | null;
  grade: "Excellent" | "Good" | "Fair" | "Needs attention" | "Insufficient data";
  components: HealthComponent[];
  availableWeight: number;
};

export type HealthInputs = {
  /** Totals over the last few completed months (newest last). */
  months: Array<{ income: Decimal; expense: Decimal }>;
  /** Liquid funds earmarked for emergencies (emergency-fund goal balance, else liquid balance). */
  emergencyFund: Decimal;
  emergencyFundTargetMonths: number;
  assets: Decimal;
  liabilities: Decimal;
  /** Utilisation (percent) of each active budget's current period. */
  budgetUtilisation: Decimal[];
};

/** Linear score: 0 at `zeroAt`, `weight` at `fullAt` (works for either direction). */
function linear(value: Decimal, zeroAt: number, fullAt: number, weight: number): number {
  const fraction = value.minus(zeroAt).div(fullAt - zeroAt);
  return Math.round(clampD(fraction, 0, 1).times(weight).toNumber() * 10) / 10;
}

const fmt1 = (d: Decimal) => d.toDecimalPlaces(1).toString();

export function computeHealthScore(input: HealthInputs): HealthScore {
  const components: HealthComponent[] = [];
  const monthsWithActivity = input.months.filter((m) => m.income.greaterThan(0) || m.expense.greaterThan(0));
  const totalIncome = monthsWithActivity.reduce((a, m) => a.plus(m.income), ZERO);
  const totalExpense = monthsWithActivity.reduce((a, m) => a.plus(m.expense), ZERO);
  const avgExpense = monthsWithActivity.length > 0 ? totalExpense.div(monthsWithActivity.length) : ZERO;

  // 1. Saving rate — 0 points at ≤0%, full points at ≥20%.
  const sr = totalIncome.greaterThan(0) ? totalIncome.minus(totalExpense).div(totalIncome).times(100) : null;
  components.push({
    key: "savingRate",
    label: "Saving rate",
    weight: 25,
    points: sr === null ? null : linear(sr, 0, 20, 25),
    valueLabel: sr === null ? "No income recorded" : `${fmt1(sr)}%`,
    rule: "Average over recent completed months. Full points at 20% or more, none at 0% or below.",
    tip: "Automate a transfer to savings right after payday, and trim your largest discretionary category.",
  });

  // 2. Emergency fund coverage — months of average expenses covered.
  const target = Math.max(1, input.emergencyFundTargetMonths);
  const coverage = avgExpense.greaterThan(0) ? input.emergencyFund.div(avgExpense) : null;
  components.push({
    key: "emergencyFund",
    label: "Emergency fund",
    weight: 25,
    points: coverage === null ? null : linear(coverage, 0, target, 25),
    valueLabel: coverage === null ? "No expense history" : `${fmt1(coverage)} months`,
    rule: `Months of average expenses your emergency fund covers. Full points at ${target} months.`,
    tip: "Create an Emergency Fund goal and contribute a fixed amount every month until it covers your target.",
  });

  // 3. Debt-to-asset ratio — full points at ≤10%, none at ≥60%.
  const ratio = input.assets.greaterThan(0) ? input.liabilities.div(input.assets).times(100) : input.liabilities.greaterThan(0) ? D(100) : null;
  components.push({
    key: "debtToAsset",
    label: "Debt-to-asset ratio",
    weight: 20,
    points: ratio === null ? null : linear(ratio, 60, 10, 20),
    valueLabel: ratio === null ? "No accounts yet" : `${fmt1(ratio)}%`,
    rule: "Liabilities divided by assets. Full points at 10% or less, none at 60% or more.",
    tip: "Pay credit card balances in full each month and prioritise the highest-interest debt first.",
  });

  // 4. Cash-flow stability — share of recent months with positive net cash flow.
  const stability =
    monthsWithActivity.length >= 3
      ? D(monthsWithActivity.filter((m) => m.income.greaterThan(m.expense)).length).div(monthsWithActivity.length).times(100)
      : null;
  components.push({
    key: "cashFlowStability",
    label: "Cash-flow stability",
    weight: 15,
    points: stability === null ? null : linear(stability, 0, 100, 15),
    valueLabel: stability === null ? "Needs 3+ months of history" : `${fmt1(stability)}% of months positive`,
    rule: "Share of recent months where income exceeded expenses.",
    tip: "Smooth irregular costs by setting aside a monthly amount for annual bills like insurance.",
  });

  // 5. Budget adherence — share of active budgets currently within their limit.
  const adherence =
    input.budgetUtilisation.length > 0
      ? D(input.budgetUtilisation.filter((p) => p.lessThanOrEqualTo(100)).length).div(input.budgetUtilisation.length).times(100)
      : null;
  components.push({
    key: "budgetAdherence",
    label: "Budget adherence",
    weight: 15,
    points: adherence === null ? null : linear(adherence, 0, 100, 15),
    valueLabel: adherence === null ? "No budgets set" : `${fmt1(adherence)}% within limit`,
    rule: "Share of your active budgets that are within their limit this period.",
    tip: "Set budgets for your top spending categories and review them weekly.",
  });

  const available = components.filter((c) => c.points !== null);
  const availableWeight = available.reduce((a, c) => a + c.weight, 0);
  // Require at least half the total weight before presenting a score.
  if (availableWeight < 50) {
    return { score: null, grade: "Insufficient data", components, availableWeight };
  }
  const earned = available.reduce((a, c) => a + (c.points ?? 0), 0);
  const score = Math.round((earned / availableWeight) * 100);
  const grade = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs attention";
  return { score, grade, components, availableWeight };
}
