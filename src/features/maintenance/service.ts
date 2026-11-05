import "server-only";
import { db } from "@/lib/db";
import { getUserContext } from "@/lib/dal";
import { addDays, addMonths, diffInDays, endOfMonth, formatDateOnly, formatMonth, startOfMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cashFlowTotals, netWorthSeries } from "@/features/analytics/calculations";
import { getBudgetOverview } from "@/features/budgets/service";
import { loadLedger, loadPosition } from "@/features/finance/repository";
import { listGoalsWithProgress } from "@/features/goals/service";
import { pushNotifications, type NotificationDraft } from "@/features/notifications/service";
import { generateDueRecurring } from "@/features/recurring/service";

const THROTTLE_MS = 10 * 60 * 1000;

/**
 * Idempotent per-user housekeeping: posts due recurring transactions, raises bill and
 * budget reminders, and records last month's snapshot. Safe to call on every page load
 * (throttled) and from the daily cron job.
 */
export async function runUserMaintenance(userId: string, options: { force?: boolean } = {}) {
  const now = new Date();
  if (!options.force) {
    // Atomically claim the run so concurrent requests don't duplicate work.
    const claimed = await db.userSettings.updateMany({
      where: { userId, OR: [{ lastMaintenanceAt: null }, { lastMaintenanceAt: { lt: new Date(now.getTime() - THROTTLE_MS) } }] },
      data: { lastMaintenanceAt: now },
    });
    if (claimed.count === 0) return { skipped: true as const };
  } else {
    await db.userSettings.updateMany({ where: { userId }, data: { lastMaintenanceAt: now } });
  }

  const ctx = await getUserContext(userId);
  const generated = await generateDueRecurring(userId, ctx.today);
  const drafts: NotificationDraft[] = [...(await billReminders(userId)), ...(await budgetAlerts(userId)), ...(await goalMilestones(userId))];
  const notified = await pushNotifications(userId, drafts);
  await recordSnapshot(userId);
  return { skipped: false as const, generated, notified };
}

async function billReminders(userId: string): Promise<NotificationDraft[]> {
  const ctx = await getUserContext(userId);
  const bills = await db.bill.findMany({
    where: { userId, deletedAt: null, isActive: true, nextDueDate: { lte: addDays(ctx.today, 30) } },
    select: { id: true, name: true, amount: true, currency: true, nextDueDate: true, reminderDays: true },
  });
  const drafts: NotificationDraft[] = [];
  for (const b of bills) {
    const days = diffInDays(ctx.today, b.nextDueDate);
    const due = formatDateOnly(b.nextDueDate);
    const amount = formatMoney(b.amount, b.currency, { locale: ctx.locale });
    if (days < 0) {
      drafts.push({ type: "BILL_OVERDUE", title: `${b.name} is overdue`, message: `${amount} was due on ${due}.`, link: "/bills", dedupeKey: `bill:${b.id}:${due}:overdue` });
    } else if (days <= b.reminderDays) {
      const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      drafts.push({ type: "BILL_DUE", title: `${b.name} due ${when}`, message: `${amount} is due on ${due}.`, link: "/bills", dedupeKey: `bill:${b.id}:${due}:due` });
    }
  }
  return drafts;
}

async function budgetAlerts(userId: string): Promise<NotificationDraft[]> {
  const budgets = await getBudgetOverview(userId);
  const alerting = new Set(["moderate", "warning", "reached", "exceeded"]);
  const drafts: NotificationDraft[] = [];
  const settingsBudgets = await db.budget.findMany({ where: { userId, deletedAt: null, alertsEnabled: true }, select: { id: true } });
  const enabled = new Set(settingsBudgets.map((b) => b.id));
  for (const b of budgets) {
    if (!enabled.has(b.id) || !b.isCurrent) continue;
    const { status, percent } = b.evaluation;
    if (!alerting.has(status) || percent === null) continue;
    const pct = percent.toDecimalPlaces(0).toString();
    drafts.push({
      type: "BUDGET_ALERT",
      title: status === "exceeded" ? `${b.name} budget exceeded` : `${b.name} budget at ${pct}%`,
      message: `You've used ${pct}% of your ${b.name} budget for this period.`,
      link: "/budgets",
      dedupeKey: `budget:${b.id}:${b.range.start}:${status}`,
    });
  }
  return drafts;
}

async function goalMilestones(userId: string): Promise<NotificationDraft[]> {
  const goals = await listGoalsWithProgress(userId);
  return goals
    .filter((g) => g.progress.isCompleted)
    .map((g) => ({ type: "GOAL" as const, title: `Goal reached: ${g.name}`, message: "Congratulations — you've hit your target.", link: "/goals", dedupeKey: `goal:${g.id}:completed` }));
}

/** Upserts the snapshot for the last completed month (idempotent via unique userId+date). */
async function recordSnapshot(userId: string) {
  const ctx = await getUserContext(userId);
  const monthStart = addMonths(startOfMonth(ctx.today), -1, 1);
  const monthEnd = endOfMonth(monthStart);
  const [{ accounts, deltas }, txs] = await Promise.all([loadPosition(userId), loadLedger(userId, { start: monthStart, end: monthEnd })]);
  if (accounts.length === 0) return;
  const [point] = netWorthSeries(accounts, deltas, [monthStart], ctx.converter);
  const totals = cashFlowTotals(txs, ctx.converter);
  const data = {
    currency: ctx.baseCurrency,
    assets: point.assets.toFixed(4),
    liabilities: point.liabilities.toFixed(4),
    netWorth: point.netWorth.toFixed(4),
    income: totals.income.toFixed(4),
    expenses: totals.expense.toFixed(4),
  };
  await db.financialSnapshot.upsert({ where: { userId_date: { userId, date: monthEnd } }, create: { userId, date: monthEnd, ...data }, update: data });
  return formatMonth(monthStart);
}
