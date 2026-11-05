import "server-only";
import { getUserContext } from "@/lib/dal";
import { db } from "@/lib/db";
import { formatDateOnly, startOfMonth } from "@/lib/dates";
import { ZERO } from "@/lib/money";
import { monthlyEquivalent } from "@/lib/recurrence";
import { categoryBreakdown, completedMonthsRange, filterRange, monthlySummaries, monthsOfHistory } from "@/features/analytics/calculations";
import { getBudgetOverview } from "@/features/budgets/service";
import { loadCategories, loadFirstTransactionDate, loadLedger, loadPosition } from "@/features/finance/repository";
import { listGoalsWithProgress } from "@/features/goals/service";
import type { Baseline } from "./projection";

/**
 * Builds the forecasting baseline from real data. Scheduled transactions (bills and
 * recurring templates) are excluded from the historical averages because they are added
 * back from their schedules — this prevents counting them twice.
 */
export async function buildBaseline(userId: string, lookbackMonths = 6): Promise<Baseline> {
  const ctx = await getUserContext(userId);
  const firstDate = await loadFirstTransactionDate(userId);
  const months = Math.min(lookbackMonths, monthsOfHistory(firstDate, startOfMonth(ctx.today), lookbackMonths));
  const range = completedMonthsRange(ctx.today, Math.max(1, months));

  const [txs, categories, { position }, goals, budgets, bills, recurring] = await Promise.all([
    loadLedger(userId, range),
    loadCategories(userId),
    loadPosition(userId),
    listGoalsWithProgress(userId),
    getBudgetOverview(userId),
    db.bill.findMany({ where: { userId, deletedAt: null, isActive: true } }),
    db.recurringTransaction.findMany({ where: { userId, deletedAt: null, isActive: true }, include: { account: { select: { currency: true } } } }),
  ]);

  const variable = months > 0 ? filterRange(txs, range).filter((t) => !t.isScheduled) : [];
  const summaries = months > 0 ? monthlySummaries(variable, range, ctx.converter) : [];
  const divisor = Math.max(1, summaries.length);
  const avgIncome = summaries.reduce((a, m) => a.plus(m.income), ZERO).div(divisor);
  const avgExpense = summaries.reduce((a, m) => a.plus(m.expense), ZERO).div(divisor);
  const expenseCategories = categoryBreakdown(variable, categories, ctx.converter).map((r) => ({
    id: r.categoryId ?? "none",
    name: r.name,
    monthly: r.amount.div(divisor).toFixed(2),
  }));

  let recurringIncome = ZERO;
  let recurringExpense = ZERO;
  for (const b of bills) {
    const base = ctx.converter.toBase(monthlyEquivalent(b.amount, { frequency: b.frequency, interval: b.interval }), b.currency);
    if (base) recurringExpense = recurringExpense.plus(base);
  }
  for (const r of recurring) {
    if (r.type === "TRANSFER") continue; // moves money between own accounts; no net effect
    const base = ctx.converter.toBase(monthlyEquivalent(r.amount, { frequency: r.frequency, interval: r.interval }), r.account.currency);
    if (!base) continue;
    if (r.type === "INCOME") recurringIncome = recurringIncome.plus(base);
    else recurringExpense = recurringExpense.plus(base);
  }

  const efGoals = goals.filter((g) => g.category === "EMERGENCY_FUND");
  const monthlyBudgets = budgets.filter((b) => b.period === "MONTHLY" && b.lines.length === 0);

  return {
    currency: ctx.baseCurrency,
    startMonth: formatDateOnly(startOfMonth(ctx.today)),
    startingCash: position.liquid.toFixed(2),
    startingNetWorth: position.netWorth.toFixed(2),
    monthsOfHistory: summaries.length,
    avgVariableIncome: avgIncome.toFixed(2),
    recurringIncome: recurringIncome.toFixed(2),
    recurringExpense: recurringExpense.toFixed(2),
    expenseCategories,
    avgMonthlyExpense: avgExpense.plus(recurringExpense).toFixed(2),
    emergencyFundGoal: efGoals.length ? efGoals.reduce((a, g) => a.plus(g.progress.current), ZERO).toFixed(2) : null,
    monthlyBudgetTotal: monthlyBudgets.length ? monthlyBudgets.reduce((a, b) => a.plus(b.evaluation.limit), ZERO).toFixed(2) : null,
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      priority: g.priority,
      remaining: g.progress.remaining.toFixed(2),
      averageMonthlyContribution: g.progress.averageMonthlyContribution.toFixed(2),
      targetDate: g.targetDate,
      isCompleted: g.progress.isCompleted,
      isEmergencyFund: g.category === "EMERGENCY_FUND",
    })),
  };
}
