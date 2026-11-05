import "server-only";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { formatDateOnly } from "@/lib/dates";
import { D } from "@/lib/money";
import { getUserContext } from "@/lib/dal";
import { goalBalance, goalProgress } from "./calculations";
import { contributionInputSchema, goalInputSchema } from "./schemas";

async function assertLinkedAccount(userId: string, accountId: string | null) {
  if (!accountId) return;
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new AppError("Linked account not found", 422, { linkedAccountId: ["Account not found"] });
}

export async function createGoal(userId: string, raw: unknown) {
  const { initialAmount, ...input } = goalInputSchema.parse(raw);
  await assertLinkedAccount(userId, input.linkedAccountId);
  const ctx = await getUserContext(userId);
  return db.$transaction(async (tx) => {
    const goal = await tx.financialGoal.create({ data: { ...input, userId } });
    if (initialAmount) {
      await tx.goalContribution.create({ data: { goalId: goal.id, userId, type: "CONTRIBUTION", amount: initialAmount, date: ctx.today, note: "Starting amount" } });
    }
    return goal;
  });
}

export async function updateGoal(userId: string, id: string, raw: unknown) {
  const { initialAmount: _ignored, ...input } = goalInputSchema.parse(raw);
  void _ignored;
  await assertLinkedAccount(userId, input.linkedAccountId);
  const r = await db.financialGoal.updateMany({ where: { id, userId, deletedAt: null }, data: input });
  if (r.count === 0) throw new NotFoundError("Goal");
}

export async function deleteGoal(userId: string, id: string) {
  const r = await db.financialGoal.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (r.count === 0) throw new NotFoundError("Goal");
}

/**
 * Adds a contribution or withdrawal. Runs serializably so two concurrent withdrawals
 * cannot take the goal balance below zero.
 */
export async function addContribution(userId: string, goalId: string, raw: unknown) {
  const input = contributionInputSchema.parse(raw);
  return db.$transaction(
    async (tx) => {
      const goal = await tx.financialGoal.findFirst({ where: { id: goalId, userId, deletedAt: null }, include: { contributions: true } });
      if (!goal) throw new NotFoundError("Goal");
      if (input.type === "WITHDRAWAL") {
        const balance = goalBalance(goal.contributions.map((c) => ({ type: c.type, amount: D(c.amount), date: c.date })));
        if (D(input.amount).greaterThan(balance)) throw new AppError("You can't withdraw more than the amount saved", 422, { amount: [`Maximum ${balance.toFixed()}`] });
      }
      return tx.goalContribution.create({ data: { ...input, goalId, userId } });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function deleteContribution(userId: string, contributionId: string) {
  return db.$transaction(
    async (tx) => {
      const c = await tx.goalContribution.findFirst({ where: { id: contributionId, userId }, include: { goal: { include: { contributions: true } } } });
      if (!c) throw new NotFoundError("Contribution");
      const remaining = c.goal.contributions.filter((x) => x.id !== c.id).map((x) => ({ type: x.type, amount: D(x.amount), date: x.date }));
      if (goalBalance(remaining).lessThan(0)) throw new AppError("Removing this contribution would make the goal balance negative", 409);
      await tx.goalContribution.delete({ where: { id: c.id } });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listGoalsWithProgress(userId: string) {
  const ctx = await getUserContext(userId);
  const goals = await db.financialGoal.findMany({
    where: { userId, deletedAt: null },
    include: { contributions: { orderBy: { date: "desc" } }, linkedAccount: { select: { id: true, name: true, currency: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return goals
    .map((g) => {
      const contributions = g.contributions.map((c) => ({ type: c.type, amount: D(c.amount), date: c.date }));
      const progress = goalProgress({ targetAmount: D(g.targetAmount), targetDate: g.targetDate, createdAt: g.createdAt }, contributions, ctx.today);
      return {
        id: g.id,
        name: g.name,
        category: g.category,
        priority: g.priority,
        color: g.color,
        description: g.description,
        notes: g.notes,
        targetAmount: D(g.targetAmount),
        targetDate: g.targetDate ? formatDateOnly(g.targetDate) : null,
        linkedAccount: g.linkedAccount,
        linkedAccountId: g.linkedAccountId,
        createdAt: g.createdAt,
        progress,
        contributions: g.contributions.map((c) => ({ id: c.id, type: c.type, amount: D(c.amount), date: formatDateOnly(c.date), note: c.note })),
      };
    })
    .sort((a, b) => Number(a.progress.isCompleted) - Number(b.progress.isCompleted) || rank[a.priority] - rank[b.priority]);
}

export type GoalWithProgress = Awaited<ReturnType<typeof listGoalsWithProgress>>[number];
