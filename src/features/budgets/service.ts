import "server-only";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { formatDateOnly, minDate, maxDate } from "@/lib/dates";
import { D, ZERO } from "@/lib/money";
import { getUserContext } from "@/lib/dal";
import { loadCategories, loadLedger } from "@/features/finance/repository";
import { budgetPeriodRange, budgetSpending, evaluateBudget } from "./calculations";
import { budgetInputSchema } from "./schemas";

async function assertExpenseCategories(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  const found = await db.category.findMany({ where: { userId, id: { in: ids }, deletedAt: null, kind: "EXPENSE" }, select: { id: true } });
  if (found.length !== new Set(ids).size) throw new AppError("Budgets can only include your expense categories", 422, { lines: ["Invalid category"] });
}

export async function createBudget(userId: string, raw: unknown) {
  const input = budgetInputSchema.parse(raw);
  await assertExpenseCategories(userId, input.lines.map((l) => l.categoryId));
  const { lines, ...data } = input;
  return db.budget.create({ data: { ...data, userId, categories: { create: lines } } });
}

export async function updateBudget(userId: string, id: string, raw: unknown) {
  const input = budgetInputSchema.parse(raw);
  await assertExpenseCategories(userId, input.lines.map((l) => l.categoryId));
  const { lines, ...data } = input;
  return db.$transaction(async (tx) => {
    const existing = await tx.budget.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new NotFoundError("Budget");
    await tx.budgetCategory.deleteMany({ where: { budgetId: id } });
    return tx.budget.update({ where: { id }, data: { ...data, categories: { create: lines } } });
  });
}

export async function deleteBudget(userId: string, id: string) {
  const r = await db.budget.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (r.count === 0) throw new NotFoundError("Budget");
}

/** Every active budget evaluated for the period containing today. */
export async function getBudgetOverview(userId: string) {
  const ctx = await getUserContext(userId);
  const budgets = await db.budget.findMany({
    where: { userId, deletedAt: null },
    include: { categories: { include: { category: { select: { id: true, name: true, color: true, icon: true, parentId: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (budgets.length === 0) return [];

  const periods = budgets.map((b) => budgetPeriodRange(b, ctx.today));
  const span = periods.reduce((acc, r) => ({ start: minDate(acc.start, r.start), end: maxDate(acc.end, r.end) }), periods[0]);
  const [txs, categories] = await Promise.all([loadLedger(userId, span), loadCategories(userId)]);

  return budgets.map((b, i) => {
    const range = periods[i];
    const lines = b.categories.map((c) => ({ categoryId: c.categoryId, amount: D(c.amount) }));
    const spending = budgetSpending(lines, txs, categories, range, ctx.converter);
    const evaluation = evaluateBudget(D(b.amount), spending.total, range, ctx.today, ctx.thresholds);
    const isCurrent = ctx.today.getTime() >= range.start.getTime() && ctx.today.getTime() <= range.end.getTime();
    return {
      id: b.id,
      name: b.name,
      period: b.period,
      startDate: formatDateOnly(b.startDate),
      endDate: b.endDate ? formatDateOnly(b.endDate) : null,
      alertsEnabled: b.alertsEnabled,
      notes: b.notes,
      range: { start: formatDateOnly(range.start), end: formatDateOnly(range.end) },
      isCurrent,
      evaluation,
      lines: b.categories.map((c) => {
        const spent = spending.byCategory.get(c.categoryId) ?? ZERO;
        return {
          categoryId: c.categoryId,
          name: c.category.name,
          color: c.category.color,
          icon: c.category.icon,
          amount: D(c.amount),
          evaluation: evaluateBudget(D(c.amount), spent, range, ctx.today, ctx.thresholds),
        };
      }),
    };
  });
}

export type BudgetOverviewItem = Awaited<ReturnType<typeof getBudgetOverview>>[number];
