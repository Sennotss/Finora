import "server-only";
import { db, type TxClient } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { formatDateOnly } from "@/lib/dates";
import { D, roundMoney } from "@/lib/money";
import { getUserContext } from "@/lib/dal";
import { describeRule, monthlyEquivalent, nextOccurrence, occurrencesUntil, type RecurrenceRule } from "@/lib/recurrence";
import { recurringInputSchema } from "@/features/bills/schemas";

/** Maximum occurrences generated per template per run (the rest catch up next run). */
const MAX_PER_RUN = 400;

function ruleOf(t: { frequency: RecurrenceRule["frequency"]; interval: number; startDate: Date }): RecurrenceRule {
  return { frequency: t.frequency, interval: t.interval, anchorDay: t.startDate.getUTCDate() };
}

async function assertRefs(userId: string, input: { type: string; accountId: string; destinationAccountId: string | null; categoryId: string | null }) {
  const ids = [input.accountId, input.destinationAccountId].filter((v): v is string => Boolean(v));
  const accounts = await db.account.findMany({ where: { userId, id: { in: ids }, status: "ACTIVE" }, select: { id: true, currency: true } });
  if (!accounts.find((a) => a.id === input.accountId)) throw new AppError("Account not found or archived", 422, { accountId: ["Account not found"] });
  if (input.destinationAccountId) {
    const dest = accounts.find((a) => a.id === input.destinationAccountId);
    if (!dest) throw new AppError("Destination account not found or archived", 422, { destinationAccountId: ["Account not found"] });
    if (dest.currency !== accounts.find((a) => a.id === input.accountId)!.currency)
      throw new AppError("Recurring transfers must be between accounts with the same currency", 422, { destinationAccountId: ["Currency mismatch"] });
  }
  if (input.categoryId) {
    const c = await db.category.findFirst({ where: { id: input.categoryId, userId, kind: input.type as "INCOME" | "EXPENSE" } });
    if (!c) throw new AppError("Category does not match the transaction type", 422, { categoryId: ["Invalid category"] });
  }
}

export async function createRecurring(userId: string, raw: unknown) {
  const input = recurringInputSchema.parse(raw);
  await assertRefs(userId, input);
  return db.recurringTransaction.create({ data: { ...input, userId, nextRunDate: input.startDate } });
}

export async function updateRecurring(userId: string, id: string, raw: unknown) {
  const input = recurringInputSchema.parse(raw);
  await assertRefs(userId, input);
  const existing = await db.recurringTransaction.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Recurring transaction");
  // Resume the (possibly changed) schedule after the last generated occurrence.
  const last = await db.transaction.findFirst({ where: { recurringTransactionId: id }, orderBy: { recurrenceDate: "desc" }, select: { recurrenceDate: true } });
  const rule = ruleOf(input);
  let next = input.startDate;
  if (last?.recurrenceDate) {
    while (next.getTime() <= last.recurrenceDate.getTime()) next = nextOccurrence(next, rule);
  }
  await db.recurringTransaction.update({ where: { id }, data: { ...input, nextRunDate: next } });
}

export async function deleteRecurring(userId: string, id: string) {
  const r = await db.recurringTransaction.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
  if (r.count === 0) throw new NotFoundError("Recurring transaction");
}

/**
 * Posts every due occurrence of one template. Idempotent: each occurrence carries its
 * scheduled date and (recurringTransactionId, recurrenceDate) is unique, so re-running —
 * even concurrently — never creates duplicates.
 */
async function generateFor(tx: TxClient, template: Awaited<ReturnType<typeof db.recurringTransaction.findFirstOrThrow>>, today: Date, currency: string): Promise<number> {
  if (!template.isActive || template.deletedAt) return 0;
  const rule = ruleOf(template);
  const dates = occurrencesUntil(template.nextRunDate, rule, today, template.endDate, MAX_PER_RUN);
  if (dates.length === 0) return 0;
  const result = await tx.transaction.createMany({
    data: dates.map((date) => ({
      userId: template.userId,
      type: template.type,
      amount: roundMoney(template.amount, currency).toFixed(),
      currency,
      date,
      description: template.description,
      accountId: template.accountId,
      destinationAccountId: template.destinationAccountId,
      categoryId: template.categoryId,
      paymentMethod: template.paymentMethod,
      recurringTransactionId: template.id,
      recurrenceDate: date,
    })),
    skipDuplicates: true,
  });
  const next = nextOccurrence(dates[dates.length - 1], rule);
  const finished = template.endDate !== null && next.getTime() > template.endDate.getTime();
  await tx.recurringTransaction.update({ where: { id: template.id }, data: { nextRunDate: next, isActive: finished ? false : template.isActive } });
  return result.count;
}

export async function generateRecurringForTemplate(userId: string, id: string): Promise<number> {
  const ctx = await getUserContext(userId);
  return db.$transaction(async (tx) => {
    const template = await tx.recurringTransaction.findFirst({ where: { id, userId }, include: { account: { select: { currency: true, status: true } } } });
    if (!template || template.account.status !== "ACTIVE") return 0;
    return generateFor(tx, template, ctx.today, template.account.currency);
  });
}

export async function generateDueRecurring(userId: string, today: Date): Promise<number> {
  const due = await db.recurringTransaction.findMany({
    where: { userId, isActive: true, deletedAt: null, nextRunDate: { lte: today } },
    include: { account: { select: { currency: true, status: true } } },
  });
  let created = 0;
  for (const template of due) {
    if (template.account.status !== "ACTIVE") continue;
    created += await db.$transaction((tx) => generateFor(tx, template, today, template.account.currency));
  }
  return created;
}

export async function listRecurring(userId: string) {
  const ctx = await getUserContext(userId);
  const rows = await db.recurringTransaction.findMany({
    where: { userId, deletedAt: null },
    include: {
      account: { select: { id: true, name: true, currency: true } },
      destinationAccount: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true, icon: true } },
      _count: { select: { transactions: { where: { deletedAt: null } } } },
    },
    orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    type: r.type,
    amount: D(r.amount),
    currency: r.account.currency,
    account: r.account,
    accountId: r.accountId,
    destinationAccount: r.destinationAccount,
    destinationAccountId: r.destinationAccountId,
    category: r.category,
    categoryId: r.categoryId,
    paymentMethod: r.paymentMethod,
    frequency: r.frequency,
    interval: r.interval,
    schedule: describeRule(ruleOf(r)),
    startDate: formatDateOnly(r.startDate),
    endDate: r.endDate ? formatDateOnly(r.endDate) : null,
    nextRunDate: formatDateOnly(r.nextRunDate),
    isActive: r.isActive,
    notes: r.notes,
    generatedCount: r._count.transactions,
    monthlyEquivalentBase: ctx.converter.toBase(monthlyEquivalent(r.amount, ruleOf(r)), r.account.currency),
  }));
}

export type RecurringItem = Awaited<ReturnType<typeof listRecurring>>[number];
