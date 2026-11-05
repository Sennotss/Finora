import "server-only";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { D, roundMoney } from "@/lib/money";
import { balanceDelta } from "@/features/analytics/calculations";
import { isLiabilityAccount } from "@/features/finance/types";
import { accountInputSchema, reconcileSchema } from "./schemas";

async function getOwnedAccount(userId: string, id: string) {
  const account = await db.account.findFirst({ where: { id, userId } });
  if (!account) throw new NotFoundError("Account");
  return account;
}

export async function listActiveAccounts(userId: string) {
  return db.account.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, name: true, type: true, currency: true, color: true, icon: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createAccount(userId: string, raw: unknown) {
  const input = accountInputSchema.parse(raw);
  if (input.creditLimit && !isLiabilityAccount(input.type)) input.creditLimit = null;
  return db.account.create({
    data: { ...input, userId, openingBalance: roundMoney(input.openingBalance, input.currency).toFixed() },
  });
}

export async function updateAccount(userId: string, id: string, raw: unknown) {
  const existing = await getOwnedAccount(userId, id);
  const input = accountInputSchema.parse(raw);
  if (input.currency !== existing.currency) {
    const used = await db.transaction.count({ where: { userId, OR: [{ accountId: id }, { destinationAccountId: id }] } });
    if (used > 0) throw new AppError("Currency cannot change once the account has transactions", 422, { currency: ["Locked: account has transactions"] });
  }
  return db.account.update({
    where: { id },
    data: {
      ...input,
      creditLimit: isLiabilityAccount(input.type) ? input.creditLimit : null,
      openingBalance: roundMoney(input.openingBalance, input.currency).toFixed(),
    },
  });
}

export async function setAccountArchived(userId: string, id: string, archived: boolean) {
  await getOwnedAccount(userId, id);
  return db.account.update({ where: { id }, data: { status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null } });
}

/** Hard delete is only allowed for accounts without any history; otherwise archive. */
export async function deleteAccount(userId: string, id: string) {
  await getOwnedAccount(userId, id);
  const used = await db.transaction.count({ where: { userId, OR: [{ accountId: id }, { destinationAccountId: id }] } });
  if (used > 0) throw new AppError("This account has transactions. Archive it instead to keep your history.", 409);
  await db.account.delete({ where: { id } });
}

/** Balance of a single account as of a date (inclusive), from opening balance + transactions. */
export async function accountBalanceAsOf(userId: string, accountId: string, asOf: Date) {
  const account = await getOwnedAccount(userId, accountId);
  const txs = await db.transaction.findMany({
    where: { userId, deletedAt: null, date: { lte: asOf }, OR: [{ accountId }, { destinationAccountId: accountId }] },
    select: { type: true, amount: true, destinationAmount: true, accountId: true, destinationAccountId: true },
  });
  const opening = account.openingDate.getTime() <= asOf.getTime() ? D(account.openingBalance) : D(0);
  const balance = txs.reduce(
    (acc, t) => acc.plus(balanceDelta({ ...t, amount: D(t.amount), destinationAmount: t.destinationAmount ? D(t.destinationAmount) : null }, accountId)),
    opening,
  );
  return { account, balance };
}

/**
 * Reconcile: compare the recorded balance with the real one and post an adjustment for
 * the difference. Adjustments change the balance but are excluded from income/expenses.
 */
export async function reconcileAccount(userId: string, accountId: string, raw: unknown) {
  const input = reconcileSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const { account, balance } = await accountBalanceAsOf(userId, accountId, input.date);
    if (account.status === "ARCHIVED") throw new AppError("Unarchive the account before reconciling", 409);
    const actual = roundMoney(input.actualBalance, account.currency);
    const difference = actual.minus(balance);
    if (difference.isZero()) return { difference: "0", adjustmentId: null };
    const adjustment = await tx.transaction.create({
      data: {
        userId,
        type: difference.greaterThan(0) ? "INCOME" : "EXPENSE",
        amount: difference.abs().toFixed(),
        currency: account.currency,
        date: input.date,
        description: "Balance reconciliation",
        notes: input.note ?? `Adjusted recorded balance ${balance.toFixed()} to actual ${actual.toFixed()}`,
        accountId,
        isAdjustment: true,
      },
    });
    return { difference: difference.toFixed(), adjustmentId: adjustment.id };
  });
}
