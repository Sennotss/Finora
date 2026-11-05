/**
 * Turns computed figures into plain-language insights. Every insight is derived from the
 * numbers passed in; when the inputs are missing the insight is simply not produced.
 */
import type Decimal from "decimal.js";
import { percentChange } from "@/lib/money";
import type { CashFlowTotals, MonthlySummary } from "@/features/analytics/calculations";
import type { BudgetStatus } from "@/features/budgets/calculations";

export type InsightTone = "positive" | "neutral" | "warning" | "negative";

export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  message: string;
  href?: string;
};

export type InsightContext = {
  formatMoney: (value: Decimal) => string;
  periodLabel: string;
  comparisonLabel: string;
  current: CashFlowTotals;
  previous: CashFlowTotals;
  topExpenseCategory: { name: string; amount: Decimal; share: Decimal } | null;
  categoryChanges: Array<{ name: string; current: Decimal; previous: Decimal }>;
  budgets: Array<{ name: string; percent: Decimal | null; projectedPercent: Decimal | null; status: BudgetStatus; isCurrent: boolean }>;
  emergencyFundMonths: Decimal | null;
  emergencyFundTargetMonths: number;
  /** Most recent completed months, oldest first. */
  recentMonths: MonthlySummary[];
  goalsBehind: Array<{ name: string; requiredMonthly: Decimal; averageMonthly: Decimal }>;
  overdueBills: number;
};

const pct = (d: Decimal) => `${d.abs().toDecimalPlaces(0).toString()}%`;

export function generateInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { current, previous } = ctx;

  // Expense change vs. the comparison period.
  if (current.expense.greaterThan(0) && previous.expense.greaterThan(0)) {
    const change = percentChange(current.expense, previous.expense)!;
    if (change.abs().greaterThanOrEqualTo(5)) {
      const up = change.greaterThan(0);
      out.push({
        id: "expense-change",
        tone: up ? (change.greaterThan(20) ? "negative" : "warning") : "positive",
        title: up ? `Expenses up ${pct(change)}` : `Expenses down ${pct(change)}`,
        message: `Your expenses ${up ? "increased" : "decreased"} by ${pct(change)} compared to ${ctx.comparisonLabel} (${ctx.formatMoney(current.expense)} vs ${ctx.formatMoney(previous.expense)}).`,
        href: "/analytics",
      });
    }
  }

  // Saving rate.
  if (current.savingRate !== null) {
    const sr = current.savingRate;
    out.push({
      id: "saving-rate",
      tone: sr.greaterThanOrEqualTo(20) ? "positive" : sr.greaterThanOrEqualTo(0) ? "neutral" : "negative",
      title: `Saving rate ${sr.toDecimalPlaces(0).toString()}%`,
      message: sr.greaterThanOrEqualTo(0)
        ? `Your saving rate is ${sr.toDecimalPlaces(0).toString()}% for ${ctx.periodLabel.toLowerCase()}.${sr.lessThan(20) ? " A common guideline is to aim for 20% or more." : ""}`
        : `You spent ${ctx.formatMoney(current.expense.minus(current.income))} more than you earned in ${ctx.periodLabel.toLowerCase()}.`,
    });
  }

  if (ctx.topExpenseCategory) {
    out.push({
      id: "top-category",
      tone: "neutral",
      title: `Largest category: ${ctx.topExpenseCategory.name}`,
      message: `Your largest expense category is ${ctx.topExpenseCategory.name} at ${ctx.formatMoney(ctx.topExpenseCategory.amount)} (${pct(ctx.topExpenseCategory.share)} of spending).`,
      href: "/analytics",
    });
  }

  // Biggest category increase (only meaningful ones).
  const increases = ctx.categoryChanges
    .filter((c) => c.previous.greaterThan(0) && c.current.greaterThan(c.previous))
    .map((c) => ({ ...c, change: percentChange(c.current, c.previous)! }))
    .filter((c) => c.change.greaterThanOrEqualTo(20))
    .sort((a, b) => b.current.minus(b.previous).comparedTo(a.current.minus(a.previous)));
  if (increases[0]) {
    const c = increases[0];
    out.push({
      id: `category-increase-${c.name}`,
      tone: "warning",
      title: `${c.name} up ${pct(c.change)}`,
      message: `Your ${c.name.toLowerCase()} expenses increased by ${pct(c.change)} compared to ${ctx.comparisonLabel}.`,
      href: "/analytics",
    });
  }

  // Budgets: exceeded, or projected to exceed.
  for (const b of ctx.budgets) {
    if (!b.isCurrent || b.percent === null) continue;
    if (b.status === "exceeded") {
      out.push({ id: `budget-${b.name}`, tone: "negative", title: `${b.name} exceeded`, message: `You have spent ${pct(b.percent)} of your ${b.name} budget.`, href: "/budgets" });
    } else if (b.status === "warning" || b.status === "reached") {
      out.push({ id: `budget-${b.name}`, tone: "warning", title: `${b.name} almost used`, message: `You have spent ${pct(b.percent)} of your ${b.name} budget.`, href: "/budgets" });
    } else if (b.projectedPercent && b.projectedPercent.greaterThan(100)) {
      out.push({
        id: `budget-pace-${b.name}`,
        tone: "warning",
        title: `${b.name} on pace to exceed`,
        message: `Your current spending pace may exceed your ${b.name} budget (projected ${pct(b.projectedPercent)} of the limit).`,
        href: "/budgets",
      });
    }
  }

  if (ctx.emergencyFundMonths !== null) {
    const months = ctx.emergencyFundMonths;
    out.push({
      id: "emergency-fund",
      tone: months.greaterThanOrEqualTo(ctx.emergencyFundTargetMonths) ? "positive" : months.greaterThanOrEqualTo(3) ? "neutral" : "warning",
      title: `Emergency fund: ${months.toDecimalPlaces(1).toString()} months`,
      message: `Your emergency fund currently covers ${months.toDecimalPlaces(1).toString()} months of estimated expenses (target: ${ctx.emergencyFundTargetMonths}).`,
      href: "/goals",
    });
  }

  // Savings trend over the last three completed months.
  const last3 = ctx.recentMonths.slice(-3);
  if (last3.length === 3 && last3.every((m) => m.income.greaterThan(0))) {
    const nets = last3.map((m) => m.net);
    if (nets.every((n) => n.greaterThan(0)) && nets[1].greaterThan(nets[0]) && nets[2].greaterThan(nets[1])) {
      out.push({ id: "savings-trend", tone: "positive", title: "Savings rising", message: "Your savings have increased consistently over the past 3 months." });
    } else if (nets.every((n) => n.lessThan(0))) {
      out.push({ id: "deficit-trend", tone: "negative", title: "Three months of deficit", message: "Your expenses exceeded your income in each of the past 3 months." });
    }
  }

  for (const g of ctx.goalsBehind.slice(0, 2)) {
    out.push({
      id: `goal-${g.name}`,
      tone: "warning",
      title: `${g.name} is behind schedule`,
      message: `You need about ${ctx.formatMoney(g.requiredMonthly)} per month to reach ${g.name} on time; recently you've averaged ${ctx.formatMoney(g.averageMonthly)}.`,
      href: "/goals",
    });
  }

  if (ctx.overdueBills > 0) {
    out.push({
      id: "overdue-bills",
      tone: "negative",
      title: `${ctx.overdueBills} overdue bill${ctx.overdueBills === 1 ? "" : "s"}`,
      message: "Some bills are past their due date. Mark them as paid once settled.",
      href: "/bills",
    });
  }

  const rank: Record<InsightTone, number> = { negative: 0, warning: 1, positive: 2, neutral: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
