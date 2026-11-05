/**
 * Forecasting and what-if simulation. Runs on both server and client; never touches
 * stored data. Every projection is an estimate built from the assumptions listed in
 * `describeAssumptions` — not a guaranteed outcome.
 *
 * Monthly model (month m = 1…horizon):
 *   income(m)  = (avgVariableIncome + recurringIncome) × (1 + incomeChange%) × incomeLossFactor(m)
 *   expense(m) = Σ category baseline × (1 + categoryChange%) × (1 + expenseChange%)
 *                + recurringExpense + newRecurringBills(m) + oneOffs(m) − extraSavings
 *   net(m)     = income(m) − expense(m)
 *   cash(m)    = cash(m−1) + net(m)          (cash(0) = liquid balance today)
 *   netWorth(m)= netWorth(0) + Σ net(1…m)
 *
 * Recurring bills/templates are taken from their schedules; historical averages exclude
 * scheduled transactions so they are not counted twice. "Extra savings" is modelled as
 * money not spent, which is then allocated to goals by priority.
 */
import type Decimal from "decimal.js";
import { addMonths } from "@/lib/dates";
import { D, ZERO } from "@/lib/money";

export type BaselineGoal = {
  id: string;
  name: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  remaining: string;
  averageMonthlyContribution: string;
  targetDate: string | null;
  isCompleted: boolean;
  isEmergencyFund: boolean;
};

/** Serializable baseline built on the server from actual data. */
export type Baseline = {
  currency: string;
  /** First day of the current month (YYYY-MM-DD). */
  startMonth: string;
  startingCash: string;
  startingNetWorth: string;
  monthsOfHistory: number;
  avgVariableIncome: string;
  recurringIncome: string;
  recurringExpense: string;
  expenseCategories: Array<{ id: string; name: string; monthly: string }>;
  avgMonthlyExpense: string;
  /** Emergency-fund goal balance, or null when the user has no such goal (liquid cash is used instead). */
  emergencyFundGoal: string | null;
  monthlyBudgetTotal: string | null;
  goals: BaselineGoal[];
};

export type OneOff = { id: string; label: string; amount: string; month: number };
export type NewBill = { id: string; label: string; monthlyAmount: string; startMonth: number };

export type Scenario = {
  incomeChangePct: number;
  expenseChangePct: number;
  categoryChangePct: Record<string, number>;
  extraSavingsMonthly: string;
  plannedPurchases: OneOff[];
  emergencyExpenses: OneOff[];
  newBills: NewBill[];
  incomeLoss: { months: number; startMonth: number; pct: number } | null;
};

export const EMPTY_SCENARIO: Scenario = {
  incomeChangePct: 0,
  expenseChangePct: 0,
  categoryChangePct: {},
  extraSavingsMonthly: "0",
  plannedPurchases: [],
  emergencyExpenses: [],
  newBills: [],
  incomeLoss: null,
};

export type ProjectedMonth = {
  index: number;
  month: Date;
  income: Decimal;
  expense: Decimal;
  net: Decimal;
  cash: Decimal;
  netWorth: Decimal;
  savedForGoals: Decimal;
};

export type GoalEta = { id: string; name: string; months: number | null; date: Date | null; targetDate: string | null; onTime: boolean | null };

export type Projection = {
  months: ProjectedMonth[];
  endCash: Decimal;
  endNetWorth: Decimal;
  totalNet: Decimal;
  averageNet: Decimal;
  minCash: Decimal;
  monthsNegativeCash: number;
  firstNegativeMonth: number | null;
  averageExpense: Decimal;
  endEmergencyFund: Decimal;
  /** Months of projected average expenses the end-of-horizon emergency fund covers. */
  emergencyCoverage: Decimal | null;
  budgetSustainable: boolean | null;
  goals: GoalEta[];
};

const PRIORITY_WEIGHT = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

function factor(pct: number): Decimal {
  return D(1).plus(D(pct).div(100));
}

export function projectScenario(baseline: Baseline, scenario: Scenario, horizon: number): Projection {
  const start = new Date(`${baseline.startMonth}T00:00:00.000Z`);
  const extra = D(scenario.extraSavingsMonthly || 0);
  const baseIncome = D(baseline.avgVariableIncome).plus(baseline.recurringIncome).times(factor(scenario.incomeChangePct));
  const categoryTotal = baseline.expenseCategories.reduce((acc, c) => acc.plus(D(c.monthly).times(factor(scenario.categoryChangePct[c.id] ?? 0))), ZERO);
  const variableExpense = categoryTotal.times(factor(scenario.expenseChangePct));

  let cash = D(baseline.startingCash);
  let netWorth = D(baseline.startingNetWorth);
  let totalNet = ZERO;
  let totalExpense = ZERO;
  let minCash = cash;
  let monthsNegative = 0;
  let firstNegative: number | null = null;
  const months: ProjectedMonth[] = [];

  for (let m = 1; m <= horizon; m++) {
    let lossFactor = D(1);
    const loss = scenario.incomeLoss;
    if (loss && m >= loss.startMonth && m < loss.startMonth + loss.months) lossFactor = D(1).minus(D(loss.pct).div(100));
    const income = baseIncome.times(lossFactor);

    let expense = variableExpense.plus(baseline.recurringExpense);
    for (const bill of scenario.newBills) if (m >= bill.startMonth) expense = expense.plus(D(bill.monthlyAmount || 0));
    for (const p of [...scenario.plannedPurchases, ...scenario.emergencyExpenses]) if (p.month === m) expense = expense.plus(D(p.amount || 0));
    // Saving more = spending less, but never below zero spending.
    expense = expense.minus(extra);
    if (expense.lessThan(0)) expense = ZERO;

    const net = income.minus(expense);
    cash = cash.plus(net);
    netWorth = netWorth.plus(net);
    totalNet = totalNet.plus(net);
    totalExpense = totalExpense.plus(expense);
    if (cash.lessThan(minCash)) minCash = cash;
    if (cash.lessThan(0)) {
      monthsNegative++;
      firstNegative ??= m;
    }
    months.push({ index: m, month: addMonths(start, m, 1), income, expense, net, cash, netWorth, savedForGoals: extra });
  }

  const averageExpense = horizon > 0 ? totalExpense.div(horizon) : ZERO;
  const goals = projectGoals(baseline, extra, start);
  const endEmergencyFund = projectedEmergencyFund(baseline, extra, horizon, cash);

  return {
    months,
    endCash: cash,
    endNetWorth: netWorth,
    totalNet,
    averageNet: horizon > 0 ? totalNet.div(horizon) : ZERO,
    minCash,
    monthsNegativeCash: monthsNegative,
    firstNegativeMonth: firstNegative,
    averageExpense,
    endEmergencyFund,
    emergencyCoverage: averageExpense.greaterThan(0) ? (endEmergencyFund.greaterThan(0) ? endEmergencyFund : ZERO).div(averageExpense) : null,
    budgetSustainable: baseline.monthlyBudgetTotal === null ? null : averageExpense.lessThanOrEqualTo(D(baseline.monthlyBudgetTotal)),
    goals,
  };
}

const priorityShare = (goals: BaselineGoal[], goal: BaselineGoal, amount: Decimal) => {
  const active = goals.filter((g) => !g.isCompleted);
  const totalWeight = active.reduce((a, g) => a + PRIORITY_WEIGHT[g.priority], 0);
  return totalWeight > 0 && !goal.isCompleted ? amount.times(PRIORITY_WEIGHT[goal.priority]).div(totalWeight) : ZERO;
};

/**
 * Emergency fund at the end of the horizon: the emergency-fund goal grows by its pace plus
 * its share of extra savings (capped at its target); without such a goal, liquid cash is used.
 */
function projectedEmergencyFund(baseline: Baseline, extra: Decimal, horizon: number, endCash: Decimal): Decimal {
  const goal = baseline.goals.find((g) => g.isEmergencyFund);
  if (!goal || baseline.emergencyFundGoal === null) return endCash;
  const current = D(baseline.emergencyFundGoal);
  if (goal.isCompleted) return current;
  const pace = D(goal.averageMonthlyContribution).plus(priorityShare(baseline.goals, goal, extra));
  const growth = pace.greaterThan(0) ? pace.times(horizon) : ZERO;
  const cap = current.plus(goal.remaining);
  const projected = current.plus(growth);
  return projected.greaterThan(cap) ? cap : projected;
}

/**
 * Goal completion at the recent contribution pace, with extra savings shared across
 * incomplete goals by priority (High 3 : Medium 2 : Low 1).
 */
export function projectGoals(baseline: Baseline, extraMonthly: Decimal, start: Date): GoalEta[] {
  return baseline.goals.map((g) => {
    if (g.isCompleted) return { id: g.id, name: g.name, months: 0, date: start, targetDate: g.targetDate, onTime: true };
    const share = priorityShare(baseline.goals, g, extraMonthly);
    const pace = D(g.averageMonthlyContribution).plus(share);
    if (pace.lessThanOrEqualTo(0)) return { id: g.id, name: g.name, months: null, date: null, targetDate: g.targetDate, onTime: g.targetDate ? false : null };
    const months = D(g.remaining).div(pace).ceil().toNumber();
    if (months > 1200) return { id: g.id, name: g.name, months: null, date: null, targetDate: g.targetDate, onTime: g.targetDate ? false : null };
    const date = addMonths(start, months, 1);
    const onTime = g.targetDate ? date.getTime() <= new Date(`${g.targetDate}T00:00:00.000Z`).getTime() : null;
    return { id: g.id, name: g.name, months, date, targetDate: g.targetDate, onTime };
  });
}

export function describeAssumptions(baseline: Baseline): string[] {
  const list = [
    `Starting point: today's liquid balance and net worth.`,
    baseline.monthsOfHistory > 0
      ? `Variable income and spending use your average over the last ${baseline.monthsOfHistory} completed month${baseline.monthsOfHistory === 1 ? "" : "s"}, excluding scheduled bills and recurring transactions.`
      : "No completed months of history yet — variable income and spending are assumed to be zero.",
    "Bills and recurring transactions are projected from their schedules, normalised to a monthly amount.",
    "Investment returns, interest, inflation and taxes are not modelled.",
    "Goal dates assume your recent contribution pace continues, plus any extra savings split by goal priority.",
    "Foreign-currency balances use your latest saved exchange rates.",
  ];
  return list;
}
