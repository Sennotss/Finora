/**
 * Centralised financial calculations. Pure functions only — no I/O, no React.
 *
 * Accounting rules implemented here:
 * - Income increases the account balance; expenses decrease it.
 * - Transfers move money between accounts and never count as income or expense.
 *   Credit card repayments are transfers into the card account, so a purchase is
 *   counted once (when charged to the card) and the repayment is not a second expense.
 * - Liability accounts (credit cards, loans) carry negative balances when money is owed.
 * - Net worth = assets − liabilities = sum of all account balances.
 * - Reconciliation adjustments change balances but are excluded from income/expense.
 * - All aggregation happens in the user's base currency via an explicit converter;
 *   amounts in currencies without a known rate are reported, never silently dropped.
 */
import type Decimal from "decimal.js";
import type { Converter } from "@/lib/currency";
import {
  addDays,
  addMonths,
  diffInDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  formatDateOnly,
  maxDate,
  minDate,
  monthKey,
  periodProgress,
  rangeLengthInDays,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDateOnly,
  type DateRange,
} from "@/lib/dates";
import { D, ZERO, percentOf } from "@/lib/money";
import {
  isLiabilityAccount,
  isLiquidAccount,
  type AccountMonthlyDelta,
  type AccountTypeValue,
  type LedgerAccount,
  type LedgerCategory,
  type LedgerTx,
} from "@/features/finance/types";

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/** Balance change a transaction causes on the given account (in that account's currency). */
export function balanceDelta(tx: Pick<LedgerTx, "type" | "amount" | "destinationAmount" | "accountId" | "destinationAccountId">, accountId: string): Decimal {
  let delta = ZERO;
  if (tx.accountId === accountId) {
    delta = tx.type === "INCOME" ? delta.plus(tx.amount) : delta.minus(tx.amount);
  }
  if (tx.type === "TRANSFER" && tx.destinationAccountId === accountId) {
    delta = delta.plus(tx.destinationAmount ?? tx.amount);
  }
  return delta;
}

/** Monthly per-account deltas — the pure equivalent of the SQL aggregation in the repository. */
export function deltasFromTransactions(txs: LedgerTx[]): AccountMonthlyDelta[] {
  const map = new Map<string, AccountMonthlyDelta>();
  const add = (accountId: string, date: Date, delta: Decimal) => {
    const month = startOfMonth(date);
    const key = `${accountId}|${formatDateOnly(month)}`;
    const existing = map.get(key);
    if (existing) existing.delta = existing.delta.plus(delta);
    else map.set(key, { accountId, month, delta });
  };
  for (const tx of txs) {
    add(tx.accountId, tx.date, tx.type === "INCOME" ? D(tx.amount) : D(tx.amount).negated());
    if (tx.type === "TRANSFER" && tx.destinationAccountId) add(tx.destinationAccountId, tx.date, D(tx.destinationAmount ?? tx.amount));
  }
  return [...map.values()].sort((a, b) => a.month.getTime() - b.month.getTime());
}

/**
 * Account balances as of the end of `asOf`'s month (or all time when omitted).
 * Opening balances count only once the account's opening date has passed.
 */
export function balancesFromDeltas(accounts: LedgerAccount[], deltas: AccountMonthlyDelta[], asOf?: Date): Map<string, Decimal> {
  const cutoff = asOf ? endOfMonth(asOf).getTime() : Number.POSITIVE_INFINITY;
  const balances = new Map<string, Decimal>();
  for (const a of accounts) {
    balances.set(a.id, a.openingDate.getTime() <= cutoff ? D(a.openingBalance) : ZERO);
  }
  for (const d of deltas) {
    if (d.month.getTime() > cutoff) continue;
    const current = balances.get(d.accountId);
    if (current !== undefined) balances.set(d.accountId, current.plus(d.delta));
  }
  return balances;
}

export type PositionSummary = {
  /** Cash, bank, e-wallet and savings balances. */
  liquid: Decimal;
  assets: Decimal;
  liabilities: Decimal;
  netWorth: Decimal;
  accounts: Array<{ account: LedgerAccount; balance: Decimal; balanceBase: Decimal | null }>;
  assetDistribution: Array<{ type: AccountTypeValue; amount: Decimal }>;
  liabilityDistribution: Array<{ type: AccountTypeValue; amount: Decimal }>;
  missingCurrencies: string[];
};

export function summarizePosition(accounts: LedgerAccount[], balances: Map<string, Decimal>, converter: Converter): PositionSummary {
  let liquid = ZERO;
  let assets = ZERO;
  let liabilities = ZERO;
  const assetByType = new Map<AccountTypeValue, Decimal>();
  const liabilityByType = new Map<AccountTypeValue, Decimal>();
  const missing = new Set<string>();
  const rows: PositionSummary["accounts"] = [];

  for (const account of accounts) {
    const balance = balances.get(account.id) ?? ZERO;
    const base = converter.toBase(balance, account.currency);
    rows.push({ account, balance, balanceBase: base });
    if (base === null) {
      if (!balance.isZero()) missing.add(account.currency);
      continue;
    }
    if (isLiquidAccount(account.type)) liquid = liquid.plus(base);

    // Positive balances are assets and negative balances are owed, whatever the account type
    // (an overdrawn bank account is a liability; an overpaid credit card is an asset).
    if (base.greaterThanOrEqualTo(0)) {
      assets = assets.plus(base);
      if (!base.isZero()) assetByType.set(account.type, (assetByType.get(account.type) ?? ZERO).plus(base));
    } else {
      liabilities = liabilities.plus(base.negated());
      liabilityByType.set(account.type, (liabilityByType.get(account.type) ?? ZERO).plus(base.negated()));
    }
  }

  const sortDesc = (m: Map<AccountTypeValue, Decimal>) =>
    [...m.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount.comparedTo(a.amount));

  return {
    liquid,
    assets,
    liabilities,
    netWorth: assets.minus(liabilities),
    accounts: rows,
    assetDistribution: sortDesc(assetByType),
    liabilityDistribution: sortDesc(liabilityByType),
    missingCurrencies: [...missing],
  };
}

export type NetWorthPoint = { month: Date; assets: Decimal; liabilities: Decimal; netWorth: Decimal };

/** Reconstructs month-end net worth from opening balances plus transaction history. */
export function netWorthSeries(accounts: LedgerAccount[], deltas: AccountMonthlyDelta[], months: Date[], converter: Converter): NetWorthPoint[] {
  return months.map((month) => {
    const balances = balancesFromDeltas(accounts, deltas, month);
    const p = summarizePosition(accounts, balances, converter);
    return { month: startOfMonth(month), assets: p.assets, liabilities: p.liabilities, netWorth: p.netWorth };
  });
}

export function isLiability(account: Pick<LedgerAccount, "type">) {
  return isLiabilityAccount(account.type);
}

// ---------------------------------------------------------------------------
// Income, expenses and cash flow
// ---------------------------------------------------------------------------

/** True for transactions that count toward income/expense totals. */
export function countsAsCashFlow(tx: Pick<LedgerTx, "type" | "isAdjustment">): boolean {
  return tx.type !== "TRANSFER" && !tx.isAdjustment;
}

export function filterRange<T extends { date: Date }>(txs: T[], range: DateRange): T[] {
  const s = range.start.getTime();
  const e = range.end.getTime();
  return txs.filter((t) => t.date.getTime() >= s && t.date.getTime() <= e);
}

export type CashFlowTotals = {
  income: Decimal;
  expense: Decimal;
  net: Decimal;
  /** null when there was no income in the period. */
  savingRate: Decimal | null;
  transactionCount: number;
  missingCurrencies: string[];
};

/** Saving Rate = (Income − Expenses) / Income × 100. Undefined (null) when income ≤ 0. */
export function savingRate(income: Decimal, expense: Decimal): Decimal | null {
  if (income.lessThanOrEqualTo(0)) return null;
  return income.minus(expense).div(income).times(100);
}

export function cashFlowTotals(txs: LedgerTx[], converter: Converter): CashFlowTotals {
  let income = ZERO;
  let expense = ZERO;
  let count = 0;
  const missing = new Set<string>();
  for (const tx of txs) {
    if (!countsAsCashFlow(tx)) continue;
    const base = converter.toBase(tx.amount, tx.currency);
    if (base === null) {
      missing.add(tx.currency);
      continue;
    }
    count++;
    if (tx.type === "INCOME") income = income.plus(base);
    else expense = expense.plus(base);
  }
  return { income, expense, net: income.minus(expense), savingRate: savingRate(income, expense), transactionCount: count, missingCurrencies: [...missing] };
}

export type Granularity = "day" | "week" | "month" | "year";

export type CashFlowBucket = {
  key: string;
  start: Date;
  end: Date;
  income: Decimal;
  expense: Decimal;
  net: Decimal;
  savingRate: Decimal | null;
};

export function pickGranularity(range: DateRange): Granularity {
  const days = rangeLengthInDays(range);
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 1100) return "month";
  return "year";
}

function bucketStart(date: Date, granularity: Granularity, weekStartsOn: number): Date {
  switch (granularity) {
    case "day":
      return toDateOnly(date);
    case "week":
      return startOfWeek(date, weekStartsOn);
    case "month":
      return startOfMonth(date);
    case "year":
      return startOfYear(date);
  }
}

function bucketEnd(start: Date, granularity: Granularity, weekStartsOn: number): Date {
  switch (granularity) {
    case "day":
      return start;
    case "week":
      return endOfWeek(start, weekStartsOn);
    case "month":
      return endOfMonth(start);
    case "year":
      return endOfYear(start);
  }
}

function nextBucket(start: Date, granularity: Granularity): Date {
  switch (granularity) {
    case "day":
      return addDays(start, 1);
    case "week":
      return addDays(start, 7);
    case "month":
      return addMonths(start, 1, 1);
    case "year":
      return addMonths(start, 12, 1);
  }
}

/** Income/expense per bucket with every bucket in the range present (zero-filled). */
export function cashFlowSeries(
  txs: LedgerTx[],
  range: DateRange,
  granularity: Granularity,
  converter: Converter,
  weekStartsOn = 1,
): CashFlowBucket[] {
  const buckets = new Map<string, CashFlowBucket>();
  const order: string[] = [];
  for (let s = bucketStart(range.start, granularity, weekStartsOn); s.getTime() <= range.end.getTime(); s = nextBucket(s, granularity)) {
    const key = formatDateOnly(s);
    order.push(key);
    // Clip partial buckets to the requested range so totals reconcile with the period.
    buckets.set(key, {
      key,
      start: maxDate(s, range.start),
      end: minDate(bucketEnd(s, granularity, weekStartsOn), range.end),
      income: ZERO,
      expense: ZERO,
      net: ZERO,
      savingRate: null,
    });
  }
  for (const tx of filterRange(txs, range)) {
    if (!countsAsCashFlow(tx)) continue;
    const base = converter.toBase(tx.amount, tx.currency);
    if (base === null) continue;
    const bucket = buckets.get(formatDateOnly(bucketStart(tx.date, granularity, weekStartsOn)));
    if (!bucket) continue;
    if (tx.type === "INCOME") bucket.income = bucket.income.plus(base);
    else bucket.expense = bucket.expense.plus(base);
  }
  return order.map((key) => {
    const b = buckets.get(key)!;
    return { ...b, net: b.income.minus(b.expense), savingRate: savingRate(b.income, b.expense) };
  });
}

export type CategoryBreakdownRow = {
  categoryId: string | null;
  name: string;
  color: string;
  amount: Decimal;
  /** Share of the total, 0–100. */
  share: Decimal;
  count: number;
};

/**
 * Totals by category for one kind of cash flow. With `rollup`, subcategory amounts are
 * reported under their parent so the chart stays readable.
 */
export function categoryBreakdown(
  txs: LedgerTx[],
  categories: LedgerCategory[],
  converter: Converter,
  options: { kind?: "EXPENSE" | "INCOME"; rollup?: boolean } = {},
): CategoryBreakdownRow[] {
  const { kind = "EXPENSE", rollup = true } = options;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { amount: Decimal; count: number }>();
  let total = ZERO;

  for (const tx of txs) {
    if (!countsAsCashFlow(tx) || tx.type !== kind) continue;
    const base = converter.toBase(tx.amount, tx.currency);
    if (base === null) continue;
    let id = tx.categoryId;
    if (rollup && id) {
      const parentId = byId.get(id)?.parentId;
      if (parentId && byId.has(parentId)) id = parentId;
    }
    const key = id ?? "__none__";
    const row = totals.get(key) ?? { amount: ZERO, count: 0 };
    row.amount = row.amount.plus(base);
    row.count++;
    totals.set(key, row);
    total = total.plus(base);
  }

  return [...totals.entries()]
    .map(([key, row]) => {
      const category = key === "__none__" ? undefined : byId.get(key);
      return {
        categoryId: category?.id ?? null,
        name: category?.name ?? "Uncategorised",
        color: category?.color ?? "#94a3b8",
        amount: row.amount,
        share: percentOf(row.amount, total) ?? ZERO,
        count: row.count,
      };
    })
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

export type WeekdaySpending = { weekday: number; total: Decimal; average: Decimal; occurrences: number };

/** Expense totals per weekday plus the average per calendar occurrence of that weekday. */
export function spendingByWeekday(txs: LedgerTx[], range: DateRange, converter: Converter): WeekdaySpending[] {
  const totals = Array.from({ length: 7 }, () => ZERO);
  const occurrences = Array.from({ length: 7 }, () => 0);
  for (let d = range.start; d.getTime() <= range.end.getTime(); d = addDays(d, 1)) occurrences[d.getUTCDay()]++;
  for (const tx of filterRange(txs, range)) {
    if (!countsAsCashFlow(tx) || tx.type !== "EXPENSE") continue;
    const base = converter.toBase(tx.amount, tx.currency);
    if (base) totals[tx.date.getUTCDay()] = totals[tx.date.getUTCDay()].plus(base);
  }
  return totals.map((total, weekday) => ({
    weekday,
    total,
    occurrences: occurrences[weekday],
    average: occurrences[weekday] > 0 ? total.div(occurrences[weekday]) : ZERO,
  }));
}

export function largestTransactions(txs: LedgerTx[], converter: Converter, limit = 5, type: "EXPENSE" | "INCOME" = "EXPENSE") {
  return txs
    .filter((t) => countsAsCashFlow(t) && t.type === type)
    .map((t) => ({ tx: t, base: converter.toBase(t.amount, t.currency) }))
    .filter((r): r is { tx: LedgerTx; base: Decimal } => r.base !== null)
    .sort((a, b) => b.base.comparedTo(a.base))
    .slice(0, limit);
}

/**
 * Average daily spending. For a period that includes today, only elapsed days count,
 * so the figure is not diluted by days that have not happened yet.
 */
export function averageDailyExpense(txs: LedgerTx[], range: DateRange, converter: Converter, today: Date): Decimal {
  const { elapsedDays } = periodProgress(range, today);
  if (elapsedDays === 0) return ZERO;
  const { expense } = cashFlowTotals(filterRange(txs, range), converter);
  return expense.div(elapsedDays);
}

/** Mean of a list of decimals; zero for an empty list. */
export function mean(values: Decimal[]): Decimal {
  if (values.length === 0) return ZERO;
  return values.reduce((acc, v) => acc.plus(v), ZERO).div(values.length);
}

export type MonthlySummary = { month: Date; key: string; income: Decimal; expense: Decimal; net: Decimal; savingRate: Decimal | null };

export function monthlySummaries(txs: LedgerTx[], range: DateRange, converter: Converter): MonthlySummary[] {
  return cashFlowSeries(txs, range, "month", converter).map((b) => ({
    month: startOfMonth(b.start),
    key: monthKey(b.start),
    income: b.income,
    expense: b.expense,
    net: b.net,
    savingRate: b.savingRate,
  }));
}

/** Last `n` fully completed months before `today`'s month. */
export function completedMonthsRange(today: Date, n: number): DateRange {
  const thisMonth = startOfMonth(today);
  return { start: addMonths(thisMonth, -n, 1), end: addDays(thisMonth, -1) };
}

/** Months of history actually covered by data (first transaction → today), capped at `cap`. */
export function monthsOfHistory(firstTransactionDate: Date | null, today: Date, cap = 12): number {
  if (!firstTransactionDate) return 0;
  const days = diffInDays(firstTransactionDate, today);
  return Math.max(0, Math.min(cap, Math.floor(days / 30.44)));
}
