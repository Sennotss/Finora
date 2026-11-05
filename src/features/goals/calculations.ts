import type Decimal from "decimal.js";
import { addDays, diffInDays, startOfMonth, addMonths } from "@/lib/dates";
import { D, ZERO, percentOf } from "@/lib/money";

export const AVG_DAYS_PER_MONTH = 30.436875;

export type ContributionLite = { type: "CONTRIBUTION" | "WITHDRAWAL"; amount: Decimal; date: Date };

export type GoalProgress = {
  target: Decimal;
  current: Decimal;
  remaining: Decimal;
  /** 0–100+, uncapped. */
  percent: Decimal;
  isCompleted: boolean;
  isOverdue: boolean;
  hasTargetDate: boolean;
  daysRemaining: number | null;
  /** Whole months left until the target date (minimum 1 while the date is in the future). */
  monthsRemaining: number | null;
  /** Monthly saving needed to hit the target date; null without a date or once complete. */
  requiredMonthly: Decimal | null;
  /** Net contributions per month over the recent window. */
  averageMonthlyContribution: Decimal;
  /** Projected completion at the recent pace; null when the pace is zero or negative. */
  estimatedCompletionDate: Date | null;
  /** Whether the recent pace reaches the target by the target date. */
  onTrack: boolean | null;
};

export function goalBalance(contributions: ContributionLite[]): Decimal {
  return contributions.reduce((acc, c) => (c.type === "CONTRIBUTION" ? acc.plus(c.amount) : acc.minus(c.amount)), ZERO);
}

/**
 * Average net monthly contribution over the last `windowMonths` full months plus the
 * current month-to-date, scaled by actual days observed (and never longer than the goal's age).
 */
export function averageMonthlyContribution(contributions: ContributionLite[], today: Date, goalCreatedAt: Date, windowMonths = 3): Decimal {
  const windowStart = startOfMonth(addMonths(today, -windowMonths, 1));
  const firstContribution = contributions.reduce<Date | null>((min, c) => (min === null || c.date < min ? c.date : min), null);
  const effectiveStart = [windowStart, goalCreatedAt, firstContribution ?? goalCreatedAt].reduce((a, b) => (a > b ? a : b));
  const days = Math.max(1, diffInDays(effectiveStart, today) + 1);
  const net = contributions
    .filter((c) => c.date.getTime() >= effectiveStart.getTime() && c.date.getTime() <= today.getTime())
    .reduce((acc, c) => (c.type === "CONTRIBUTION" ? acc.plus(c.amount) : acc.minus(c.amount)), ZERO);
  // Require at least two weeks of observation before extrapolating a pace.
  if (days < 14) return net.greaterThan(0) ? net : ZERO;
  return net.div(days).times(AVG_DAYS_PER_MONTH);
}

export function goalProgress(
  goal: { targetAmount: Decimal; targetDate: Date | null; createdAt: Date },
  contributions: ContributionLite[],
  today: Date,
): GoalProgress {
  const target = D(goal.targetAmount);
  const current = goalBalance(contributions);
  const remaining = target.minus(current).greaterThan(0) ? target.minus(current) : ZERO;
  const isCompleted = current.greaterThanOrEqualTo(target);
  const percent = percentOf(current, target) ?? (isCompleted ? D(100) : ZERO);
  const avg = averageMonthlyContribution(contributions, today, goal.createdAt);

  let daysRemaining: number | null = null;
  let monthsRemaining: number | null = null;
  let requiredMonthly: Decimal | null = null;
  let isOverdue = false;

  if (goal.targetDate) {
    daysRemaining = diffInDays(today, goal.targetDate);
    isOverdue = !isCompleted && daysRemaining < 0;
    monthsRemaining = daysRemaining <= 0 ? 0 : Math.max(1, Math.ceil(daysRemaining / AVG_DAYS_PER_MONTH));
    if (!isCompleted) requiredMonthly = monthsRemaining === 0 ? remaining : remaining.div(monthsRemaining);
  }

  let estimatedCompletionDate: Date | null = null;
  if (isCompleted) estimatedCompletionDate = today;
  else if (avg.greaterThan(0)) {
    const monthsNeeded = remaining.div(avg);
    // Cap the horizon at 100 years to avoid absurd dates from tiny paces.
    if (monthsNeeded.lessThan(1200)) estimatedCompletionDate = addDays(today, Math.ceil(monthsNeeded.times(AVG_DAYS_PER_MONTH).toNumber()));
  }

  let onTrack: boolean | null = null;
  if (isCompleted) onTrack = true;
  else if (goal.targetDate) onTrack = estimatedCompletionDate !== null && estimatedCompletionDate.getTime() <= goal.targetDate.getTime();

  return {
    target,
    current,
    remaining,
    percent,
    isCompleted,
    isOverdue,
    hasTargetDate: goal.targetDate !== null,
    daysRemaining,
    monthsRemaining,
    requiredMonthly,
    averageMonthlyContribution: avg,
    estimatedCompletionDate,
    onTrack,
  };
}
