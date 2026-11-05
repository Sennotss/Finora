import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { formatDateOnly, parseDateOnly, type DateRange } from "@/lib/dates";
import { D } from "@/lib/money";
import { balancesFromDeltas, summarizePosition } from "@/features/analytics/calculations";
import { getUserContext } from "@/lib/dal";
import type { AccountMonthlyDelta, LedgerAccount, LedgerCategory, LedgerTx } from "./types";

/** All accounts, including archived ones (their history still counts). */
export const loadAccounts = cache(async (userId: string): Promise<LedgerAccount[]> => {
  const rows = await db.account.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    openingBalance: D(a.openingBalance),
    openingDate: a.openingDate,
    status: a.status,
    color: a.color,
    icon: a.icon,
    institution: a.institution,
    creditLimit: a.creditLimit ? D(a.creditLimit) : null,
  }));
});

/** Includes soft-deleted categories so historical transactions keep their labels. */
export const loadCategories = cache(async (userId: string): Promise<Array<LedgerCategory & { deleted: boolean }>> => {
  const rows = await db.category.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId, color: c.color, icon: c.icon, deleted: c.deletedAt !== null }));
});

type DeltaRow = { account_id: string; month: Date; delta: { toString(): string } };

/**
 * Net balance change per account per month, computed in the database so balance and
 * net-worth history never require loading every transaction.
 */
export const loadMonthlyDeltas = cache(async (userId: string): Promise<AccountMonthlyDelta[]> => {
  const rows = await db.$queryRaw<DeltaRow[]>`
    SELECT account_id, month, SUM(delta) AS delta FROM (
      SELECT "accountId" AS account_id,
             date_trunc('month', "date")::date AS month,
             CASE WHEN "type" = 'INCOME' THEN "amount" ELSE -"amount" END AS delta
        FROM "Transaction"
       WHERE "userId" = ${userId} AND "deletedAt" IS NULL
      UNION ALL
      SELECT "destinationAccountId" AS account_id,
             date_trunc('month', "date")::date AS month,
             COALESCE("destinationAmount", "amount") AS delta
        FROM "Transaction"
       WHERE "userId" = ${userId} AND "deletedAt" IS NULL
         AND "type" = 'TRANSFER' AND "destinationAccountId" IS NOT NULL
    ) t
    GROUP BY account_id, month
    ORDER BY month`;
  return rows.map((r) => ({ accountId: r.account_id, month: parseDateOnly(formatDateOnly(new Date(r.month))), delta: D(r.delta) }));
});

export const loadPosition = cache(async (userId: string) => {
  const [accounts, deltas, ctx] = await Promise.all([loadAccounts(userId), loadMonthlyDeltas(userId), getUserContext(userId)]);
  const balances = balancesFromDeltas(accounts, deltas);
  return { accounts, deltas, balances, position: summarizePosition(accounts, balances, ctx.converter) };
});

const ledgerSelect = {
  id: true,
  type: true,
  amount: true,
  destinationAmount: true,
  currency: true,
  date: true,
  accountId: true,
  destinationAccountId: true,
  categoryId: true,
  description: true,
  isAdjustment: true,
  recurringTransactionId: true,
  billPayment: { select: { id: true } },
} as const;

const loadLedgerByKey = cache(async (userId: string, start: string, end: string): Promise<LedgerTx[]> => {
  const rows = await db.transaction.findMany({
    where: { userId, deletedAt: null, date: { gte: parseDateOnly(start), lte: parseDateOnly(end) } },
    select: ledgerSelect,
    orderBy: { date: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: D(t.amount),
    destinationAmount: t.destinationAmount ? D(t.destinationAmount) : null,
    currency: t.currency,
    date: t.date,
    accountId: t.accountId,
    destinationAccountId: t.destinationAccountId,
    categoryId: t.categoryId,
    description: t.description,
    isAdjustment: t.isAdjustment,
    isScheduled: t.recurringTransactionId !== null || t.billPayment !== null,
  }));
});

/** Non-deleted transactions within an inclusive date range. */
export function loadLedger(userId: string, range: DateRange): Promise<LedgerTx[]> {
  return loadLedgerByKey(userId, formatDateOnly(range.start), formatDateOnly(range.end));
}

export const loadFirstTransactionDate = cache(async (userId: string): Promise<Date | null> => {
  const first = await db.transaction.findFirst({ where: { userId, deletedAt: null }, orderBy: { date: "asc" }, select: { date: true } });
  return first?.date ?? null;
});
