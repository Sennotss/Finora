import "server-only";
import type Decimal from "decimal.js";
import { db } from "@/lib/db";
import { getUserContext } from "@/lib/dal";
import {
  addDays,
  addMonths,
  eachMonthStart,
  formatDateOnly,
  maxDate,
  minDate,
  monthKey,
  periodProgress,
  rangeLengthInDays,
  startOfMonth,
  endOfMonth,
  type DateRange,
  type ResolvedPeriod,
} from "@/lib/dates";
import { D, ZERO, formatMoney, percentChange } from "@/lib/money";
import {
  averageDailyExpense,
  cashFlowSeries,
  cashFlowTotals,
  categoryBreakdown,
  completedMonthsRange,
  filterRange,
  largestTransactions,
  mean,
  monthlySummaries,
  netWorthSeries,
  pickGranularity,
  spendingByWeekday,
  type CashFlowBucket,
  type Granularity,
} from "./calculations";
import { computeHealthScore } from "./health-score";
import { getBudgetOverview } from "@/features/budgets/service";
import { loadCategories, loadLedger, loadPosition } from "@/features/finance/repository";
import { listGoalsWithProgress } from "@/features/goals/service";
import { detectCategorySpikes, detectLargeTransactions, detectRecurringAnomalies, detectSpendingPace, findRecurringPatterns } from "@/features/insights/anomalies";
import { generateInsights } from "@/features/insights/insights";
import type { LedgerTx } from "@/features/finance/types";

/** Chart geometry needs numbers; all arithmetic above this point is exact decimal. */
export const n = (d: Decimal) => d.toDecimalPlaces(2).toNumber();

function bucketLabel(b: CashFlowBucket, granularity: Granularity) {
  const start = b.start;
  switch (granularity) {
    case "day":
      return start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    case "week":
      return `Wk ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
    case "month":
      return start.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
    case "year":
      return String(start.getUTCFullYear());
  }
}

export function serializeSeries(series: CashFlowBucket[], granularity: Granularity) {
  return series.map((b) => ({
    key: b.key,
    label: bucketLabel(b, granularity),
    income: n(b.income),
    expense: n(b.expense),
    net: n(b.net),
  }));
}

/** Months shown in trend charts: the selected range, extended to at least `minMonths`. */
export function trendRangeFor(range: DateRange, minMonths = 6): DateRange {
  const end = endOfMonth(range.end);
  const minStart = startOfMonth(addMonths(range.end, -(minMonths - 1), 1));
  return { start: minDate(startOfMonth(range.start), minStart), end };
}

async function emergencyFundBalance(userId: string, liquid: Decimal) {
  const goals = await listGoalsWithProgress(userId);
  const efGoals = goals.filter((g) => g.category === "EMERGENCY_FUND");
  if (efGoals.length === 0) return { amount: liquid, source: "liquid" as const, goals };
  return { amount: efGoals.reduce((acc, g) => acc.plus(g.progress.current), ZERO), source: "goal" as const, goals };
}

/** Shared figures for the overview and analytics pages. */
export async function buildFinancialContext(userId: string, period: ResolvedPeriod, options: { trendMonths?: number } = {}) {
  const ctx = await getUserContext(userId);
  const trendRange = trendRangeFor(period.range, options.trendMonths ?? 6);
  const healthRange = completedMonthsRange(ctx.today, 6);
  const ledgerRange: DateRange = {
    start: [period.previous.start, trendRange.start, healthRange.start].reduce(minDate),
    end: [period.range.end, trendRange.end, ctx.today].reduce(maxDate),
  };

  const [txs, categories, { accounts, deltas, position }, budgets] = await Promise.all([
    loadLedger(userId, ledgerRange),
    loadCategories(userId),
    loadPosition(userId),
    getBudgetOverview(userId),
  ]);
  const ef = await emergencyFundBalance(userId, position.liquid);

  const periodTxs = filterRange(txs, period.range);
  const previousTxs = filterRange(txs, period.previous);
  const current = cashFlowTotals(periodTxs, ctx.converter);
  const previous = cashFlowTotals(previousTxs, ctx.converter);
  const granularity = pickGranularity(period.range);
  const cashFlow = cashFlowSeries(txs, period.range, granularity, ctx.converter, ctx.weekStartsOn);
  const expenseBreakdown = categoryBreakdown(periodTxs, categories, ctx.converter, { kind: "EXPENSE" });
  const incomeBreakdown = categoryBreakdown(periodTxs, categories, ctx.converter, { kind: "INCOME" });
  const months = monthlySummaries(txs, trendRange, ctx.converter);
  const netWorth = netWorthSeries(accounts, deltas, eachMonthStart(trendRange), ctx.converter);

  const healthMonths = monthlySummaries(txs, healthRange, ctx.converter);
  const activeMonths = healthMonths.filter((m) => m.income.greaterThan(0) || m.expense.greaterThan(0));
  const avgMonthlyExpense = mean(activeMonths.map((m) => m.expense));
  const emergencyMonths = avgMonthlyExpense.greaterThan(0) ? ef.amount.div(avgMonthlyExpense) : null;

  const health = computeHealthScore({
    months: healthMonths,
    emergencyFund: ef.amount,
    emergencyFundTargetMonths: ctx.emergencyFundMonths,
    assets: position.assets,
    liabilities: position.liabilities,
    budgetUtilisation: budgets.filter((b) => b.isCurrent && b.evaluation.percent !== null).map((b) => b.evaluation.percent!),
  });

  const previousBreakdown = categoryBreakdown(previousTxs, categories, ctx.converter, { kind: "EXPENSE" });
  const previousById = new Map(previousBreakdown.map((r) => [r.categoryId, r.amount]));
  const overdueBills = await db.bill.count({ where: { userId, deletedAt: null, isActive: true, nextDueDate: { lt: ctx.today } } });
  const fmt = (v: Decimal) => formatMoney(v, ctx.baseCurrency, { locale: ctx.locale });

  const insights = generateInsights({
    formatMoney: fmt,
    periodLabel: period.label,
    comparisonLabel: period.preset === "this_month" || period.preset === "last_month" ? "the previous month" : "the previous period",
    current,
    previous,
    topExpenseCategory: expenseBreakdown[0] ? { name: expenseBreakdown[0].name, amount: expenseBreakdown[0].amount, share: expenseBreakdown[0].share } : null,
    categoryChanges: expenseBreakdown.map((r) => ({ name: r.name, current: r.amount, previous: previousById.get(r.categoryId) ?? ZERO })),
    budgets: budgets.map((b) => ({ name: b.name, percent: b.evaluation.percent, projectedPercent: b.evaluation.projectedPercent, status: b.evaluation.status, isCurrent: b.isCurrent })),
    emergencyFundMonths: emergencyMonths,
    emergencyFundTargetMonths: ctx.emergencyFundMonths,
    recentMonths: healthMonths,
    goalsBehind: ef.goals
      .filter((g) => !g.progress.isCompleted && g.progress.onTrack === false && g.progress.requiredMonthly)
      .map((g) => ({ name: g.name, requiredMonthly: g.progress.requiredMonthly!, averageMonthly: g.progress.averageMonthlyContribution })),
    overdueBills,
  });

  return {
    ctx,
    txs,
    categories,
    accounts,
    deltas,
    position,
    budgets,
    goals: ef.goals,
    emergencyFund: { amount: ef.amount, source: ef.source, months: emergencyMonths },
    avgMonthlyExpense,
    current,
    previous,
    granularity,
    cashFlow,
    expenseBreakdown,
    incomeBreakdown,
    months,
    netWorth,
    health,
    insights,
    trendRange,
    hasData: txs.length > 0 || accounts.length > 0,
  };
}

export type FinancialContext = Awaited<ReturnType<typeof buildFinancialContext>>;

/** Extra figures for the Analytics page. */
export async function buildAnalytics(userId: string, period: ResolvedPeriod) {
  const base = await buildFinancialContext(userId, period, { trendMonths: 12 });
  const { ctx, categories } = base;
  const range = period.range;

  // Two years of history for year-over-year comparison and anomaly baselines.
  const historyRange: DateRange = { start: startOfMonth(addMonths(ctx.today, -23, 1)), end: maxDate(range.end, ctx.today) };
  const history = await loadLedger(userId, historyRange);
  const periodTxs = filterRange(history, range);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";

  const series = {
    day: serializeSeries(cashFlowSeries(history, range, "day", ctx.converter, ctx.weekStartsOn), "day"),
    week: serializeSeries(cashFlowSeries(history, range, "week", ctx.converter, ctx.weekStartsOn), "week"),
    month: serializeSeries(cashFlowSeries(history, range, "month", ctx.converter, ctx.weekStartsOn), "month"),
    year: serializeSeries(cashFlowSeries(history, { start: historyRange.start, end: range.end }, "year", ctx.converter, ctx.weekStartsOn), "year"),
  };

  // Year over year: monthly expenses this calendar year vs last.
  const year = ctx.today.getUTCFullYear();
  const thisYear = monthlySummaries(history, { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) }, ctx.converter);
  const lastYear = monthlySummaries(history, { start: new Date(Date.UTC(year - 1, 0, 1)), end: new Date(Date.UTC(year - 1, 11, 31)) }, ctx.converter);
  const yoy = thisYear.map((m, i) => ({
    label: m.month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    current: m.month.getTime() <= ctx.today.getTime() ? n(m.expense) : null,
    previous: n(lastYear[i]?.expense ?? ZERO),
  }));

  // Spending.
  const completedMonths = monthlySummaries(history, completedMonthsRange(ctx.today, 6), ctx.converter).filter((m) => m.expense.greaterThan(0));
  const topCategoryIds = base.expenseBreakdown.slice(0, 5).map((r) => r.categoryId);
  const monthRange = trendRangeFor(range, 6);
  const categoryTrend = eachMonthStart(monthRange).map((month) => {
    const rows = categoryBreakdown(filterRange(history, { start: month, end: endOfMonth(month) }), categories, ctx.converter);
    const entry: Record<string, string | number> = { label: month.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) };
    let other = ZERO;
    for (const r of rows) {
      if (topCategoryIds.includes(r.categoryId)) entry[r.categoryId ?? "none"] = n(r.amount);
      else other = other.plus(r.amount);
    }
    entry.other = n(other);
    return entry;
  });

  const patterns = findRecurringPatterns(filterRange(history, { start: addMonths(ctx.today, -6), end: ctx.today }), ctx.converter);
  const scheduledExpense = cashFlowTotals(periodTxs.filter((t) => t.isScheduled), ctx.converter).expense;

  // Anomalies: last 30 days vs the 180 days before that.
  const recentRange = { start: addDays(ctx.today, -29), end: ctx.today };
  const baselineRange = { start: addDays(recentRange.start, -180), end: addDays(recentRange.start, -1) };
  const recentTxs = filterRange(history, recentRange);
  const baselineTxs = filterRange(history, baselineRange);
  const monthStart = startOfMonth(ctx.today);
  const byCategory = (txs: LedgerTx[]) => new Map(categoryBreakdown(txs, categories, ctx.converter).map((r) => [r.categoryId, r.amount] as const));
  const priorMonths = [1, 2, 3].map((k) => {
    const s = addMonths(monthStart, -k, 1);
    return byCategory(filterRange(history, { start: s, end: endOfMonth(s) }));
  });
  const currentMonthTxs = filterRange(history, { start: monthStart, end: ctx.today });
  const { elapsedDays } = periodProgress({ start: monthStart, end: endOfMonth(monthStart) }, ctx.today);
  const priorDaily = (() => {
    const s = addMonths(monthStart, -3, 1);
    const r = { start: s, end: addDays(monthStart, -1) };
    return cashFlowTotals(filterRange(history, r), ctx.converter).expense.div(rangeLengthInDays(r));
  })();
  const anomalies = [
    ...detectLargeTransactions(recentTxs, baselineTxs, ctx.converter, catName),
    ...detectCategorySpikes(byCategory(currentMonthTxs), priorMonths, catName, base.avgMonthlyExpense.times("0.05")),
    ...detectRecurringAnomalies(patterns),
    ...detectSpendingPace(averageDailyExpense(currentMonthTxs, { start: monthStart, end: endOfMonth(monthStart) }, ctx.converter, ctx.today), priorDaily, elapsedDays),
  ];

  const nwFirst = base.netWorth[0]?.netWorth ?? ZERO;
  const nwLast = base.netWorth[base.netWorth.length - 1]?.netWorth ?? ZERO;

  return {
    ...base,
    series,
    yoy,
    year,
    spending: {
      averageDaily: averageDailyExpense(periodTxs, range, ctx.converter, ctx.today),
      averageMonthly: mean(completedMonths.map((m) => m.expense)),
      completedMonthCount: completedMonths.length,
      largest: largestTransactions(periodTxs, ctx.converter, 8).map((r) => ({ id: r.tx.id, description: r.tx.description, date: formatDateOnly(r.tx.date), amount: r.base, category: catName(r.tx.categoryId) })),
      weekday: spendingByWeekday(periodTxs, range, ctx.converter),
      detailedBreakdown: categoryBreakdown(periodTxs, categories, ctx.converter, { rollup: false }),
      categoryTrend,
      categoryTrendKeys: base.expenseBreakdown.slice(0, 5).map((r) => ({ key: r.categoryId ?? "none", name: r.name, color: r.color })),
      recurringPatterns: patterns,
      scheduledExpense,
    },
    netWorthGrowth: { start: nwFirst, end: nwLast, change: nwLast.minus(nwFirst), percent: percentChange(nwLast, nwFirst) },
    anomalies,
    monthKeys: base.months.map((m) => monthKey(m.month)),
  };
}

export const toChartNumber = n;
export { D };
