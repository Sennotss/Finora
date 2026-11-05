import "server-only";
import { db } from "@/lib/db";
import { AppError, NotFoundError, isUniqueViolation } from "@/lib/errors";
import { addDays, diffInDays, formatDateOnly } from "@/lib/dates";
import { D, ZERO, roundMoney } from "@/lib/money";
import { getUserContext } from "@/lib/dal";
import { monthlyEquivalent, nextOccurrence, type RecurrenceRule } from "@/lib/recurrence";
import { billInputSchema, payBillSchema } from "./schemas";

export function billRule(bill: { frequency: RecurrenceRule["frequency"]; interval: number; nextDueDate: Date }, anchorDay?: number): RecurrenceRule {
  return { frequency: bill.frequency, interval: bill.interval, anchorDay: anchorDay ?? bill.nextDueDate.getUTCDate() };
}

async function assertRefs(userId: string, accountId: string | null, categoryId: string | null) {
  if (accountId && !(await db.account.findFirst({ where: { id: accountId, userId } }))) throw new AppError("Account not found", 422, { accountId: ["Account not found"] });
  if (categoryId && !(await db.category.findFirst({ where: { id: categoryId, userId, kind: "EXPENSE" } })))
    throw new AppError("Choose an expense category", 422, { categoryId: ["Choose an expense category"] });
}

export async function createBill(userId: string, raw: unknown) {
  const input = billInputSchema.parse(raw);
  await assertRefs(userId, input.accountId, input.categoryId);
  return db.bill.create({ data: { ...input, amount: roundMoney(input.amount, input.currency).toFixed(), userId } });
}

export async function updateBill(userId: string, id: string, raw: unknown) {
  const input = billInputSchema.parse(raw);
  await assertRefs(userId, input.accountId, input.categoryId);
  const r = await db.bill.updateMany({ where: { id, userId, deletedAt: null }, data: { ...input, amount: roundMoney(input.amount, input.currency).toFixed() } });
  if (r.count === 0) throw new NotFoundError("Bill");
}

export async function deleteBill(userId: string, id: string) {
  const r = await db.bill.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
  if (r.count === 0) throw new NotFoundError("Bill");
}

/**
 * Marks the bill's current due date as paid: records the payment (unique per bill and
 * due date, so retries are idempotent), optionally posts the expense, and advances the
 * due date. The bill row is locked to serialise concurrent clicks.
 */
export async function payBill(userId: string, billId: string, raw: unknown) {
  const input = payBillSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = ${billId} AND "userId" = ${userId} FOR UPDATE`;
      const bill = await tx.bill.findFirst({ where: { id: billId, userId, deletedAt: null } });
      if (!bill) throw new NotFoundError("Bill");
      if (!bill.isActive) throw new AppError("This bill is inactive", 409);
      if (input.dueDate && input.dueDate.getTime() !== bill.nextDueDate.getTime()) {
        throw new AppError("This bill was already paid for that due date", 409);
      }

      let transactionId: string | null = null;
      const accountId = input.accountId ?? bill.accountId;
      if (input.recordTransaction) {
        if (!accountId) throw new AppError("Choose the account the bill was paid from", 422, { accountId: ["Account is required"] });
        const account = await tx.account.findFirst({ where: { id: accountId, userId, status: "ACTIVE" } });
        if (!account) throw new AppError("Account not found or archived", 422, { accountId: ["Account not found"] });
        const created = await tx.transaction.create({
          data: {
            userId,
            type: "EXPENSE",
            amount: roundMoney(input.amount, account.currency).toFixed(),
            currency: account.currency,
            date: input.paidDate,
            description: bill.name,
            accountId,
            categoryId: bill.categoryId,
            notes: `Bill payment for due date ${formatDateOnly(bill.nextDueDate)}`,
          },
        });
        transactionId = created.id;
      }

      await tx.billPayment.create({ data: { billId, userId, dueDate: bill.nextDueDate, paidDate: input.paidDate, amount: input.amount, transactionId } });
      const next = nextOccurrence(bill.nextDueDate, billRule(bill));
      const finished = bill.endDate !== null && next.getTime() > bill.endDate.getTime();
      await tx.bill.update({ where: { id: billId }, data: finished ? { isActive: false } : { nextDueDate: next } });
      return { transactionId, nextDueDate: finished ? null : formatDateOnly(next) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("This bill has already been paid for that due date", 409);
    throw error;
  }
}

/** Reverts the most recent payment: restores the due date and soft-deletes its transaction. */
export async function undoLastPayment(userId: string, billId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = ${billId} AND "userId" = ${userId} FOR UPDATE`;
    const payment = await tx.billPayment.findFirst({ where: { billId, userId }, orderBy: { dueDate: "desc" } });
    if (!payment) throw new AppError("No payments to undo", 409);
    if (payment.transactionId) await tx.transaction.updateMany({ where: { id: payment.transactionId, userId }, data: { deletedAt: new Date() } });
    await tx.billPayment.delete({ where: { id: payment.id } });
    await tx.bill.update({ where: { id: billId }, data: { nextDueDate: payment.dueDate, isActive: true } });
  });
}

export type BillStatus = "overdue" | "due_soon" | "upcoming" | "inactive";

export async function listBills(userId: string) {
  const ctx = await getUserContext(userId);
  const bills = await db.bill.findMany({
    where: { userId, deletedAt: null },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true, icon: true } },
      payments: { orderBy: { dueDate: "desc" }, take: 6 },
    },
    orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }],
  });
  return bills.map((b) => {
    const days = diffInDays(ctx.today, b.nextDueDate);
    const status: BillStatus = !b.isActive ? "inactive" : days < 0 ? "overdue" : days <= b.reminderDays ? "due_soon" : "upcoming";
    return {
      id: b.id,
      name: b.name,
      amount: D(b.amount),
      currency: b.currency,
      frequency: b.frequency,
      interval: b.interval,
      nextDueDate: formatDateOnly(b.nextDueDate),
      endDate: b.endDate ? formatDateOnly(b.endDate) : null,
      isSubscription: b.isSubscription,
      reminderDays: b.reminderDays,
      isActive: b.isActive,
      url: b.url,
      notes: b.notes,
      account: b.account,
      accountId: b.accountId,
      category: b.category,
      categoryId: b.categoryId,
      daysUntilDue: days,
      status,
      monthlyEquivalent: monthlyEquivalent(b.amount, billRule(b)),
      monthlyEquivalentBase: ctx.converter.toBase(monthlyEquivalent(b.amount, billRule(b)), b.currency),
      payments: b.payments.map((p) => ({ id: p.id, dueDate: formatDateOnly(p.dueDate), paidDate: formatDateOnly(p.paidDate), amount: D(p.amount), transactionId: p.transactionId })),
    };
  });
}

export type BillItem = Awaited<ReturnType<typeof listBills>>[number];

export function billTotals(bills: BillItem[]) {
  const active = bills.filter((b) => b.isActive);
  return {
    monthlyRecurring: active.reduce((acc, b) => acc.plus(b.monthlyEquivalentBase ?? ZERO), ZERO),
    subscriptionsMonthly: active.filter((b) => b.isSubscription).reduce((acc, b) => acc.plus(b.monthlyEquivalentBase ?? ZERO), ZERO),
    overdue: active.filter((b) => b.status === "overdue"),
    dueSoon: active.filter((b) => b.status === "due_soon"),
    missingRates: active.some((b) => b.monthlyEquivalentBase === null),
  };
}

export async function upcomingBills(userId: string, days = 14) {
  const ctx = await getUserContext(userId);
  return db.bill.findMany({
    where: { userId, deletedAt: null, isActive: true, nextDueDate: { lte: addDays(ctx.today, days) } },
    orderBy: { nextDueDate: "asc" },
    take: 6,
    select: { id: true, name: true, amount: true, currency: true, nextDueDate: true },
  });
}
