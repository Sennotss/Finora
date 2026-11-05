import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type TxClient } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { isPeriodPreset, resolvePeriod, type DateRange } from "@/lib/dates";
import { getUserContext } from "@/lib/dal";
import { roundMoney } from "@/lib/money";
import { bulkActionSchema, transactionFiltersSchema, transactionInputSchema, type TransactionData, type TransactionFilters } from "./schemas";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const transactionListInclude = {
  account: { select: { id: true, name: true, color: true, currency: true, type: true } },
  destinationAccount: { select: { id: true, name: true, color: true, currency: true, type: true } },
  category: { select: { id: true, name: true, color: true, icon: true, parentId: true, parent: { select: { name: true } } } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  receipt: { select: { id: true, fileName: true, mimeType: true, size: true } },
  billPayment: { select: { id: true, bill: { select: { id: true, name: true } } } },
  recurringTransaction: { select: { id: true, description: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof transactionListInclude }>;

export function parseFilters(raw: Record<string, string | string[] | undefined>): TransactionFilters {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ""));
  return transactionFiltersSchema.parse(flat);
}

export function filterDateRange(filters: TransactionFilters, today: Date, weekStartsOn: number): DateRange | null {
  if (filters.from || filters.to) return resolvePeriod("custom", today, { from: filters.from, to: filters.to ?? filters.from }).range;
  if (filters.period && isPeriodPreset(filters.period) && filters.period !== "custom") return resolvePeriod(filters.period, today, { weekStartsOn }).range;
  return null;
}

async function buildWhere(userId: string, filters: TransactionFilters): Promise<Prisma.TransactionWhereInput> {
  const ctx = await getUserContext(userId);
  const and: Prisma.TransactionWhereInput[] = [{ userId }, filters.view === "deleted" ? { deletedAt: { not: null } } : { deletedAt: null }];
  if (filters.q) {
    and.push({
      OR: [
        { description: { contains: filters.q, mode: "insensitive" } },
        { merchant: { contains: filters.q, mode: "insensitive" } },
        { notes: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.type) and.push({ type: filters.type });
  if (filters.account) and.push({ OR: [{ accountId: filters.account }, { destinationAccountId: filters.account }] });
  if (filters.category) {
    if (filters.category === "none") and.push({ categoryId: null, type: { not: "TRANSFER" } });
    else and.push({ OR: [{ categoryId: filters.category }, { category: { parentId: filters.category } }] });
  }
  if (filters.method) and.push({ paymentMethod: filters.method });
  if (filters.tag) and.push({ tags: { some: { tagId: filters.tag } } });
  const range = filterDateRange(filters, ctx.today, ctx.weekStartsOn);
  if (range) and.push({ date: { gte: range.start, lte: range.end } });
  return { AND: and };
}

function orderBy(sort: TransactionFilters["sort"]): Prisma.TransactionOrderByWithRelationInput[] {
  switch (sort) {
    case "date_asc":
      return [{ date: "asc" }, { createdAt: "asc" }];
    case "amount_desc":
      return [{ amount: "desc" }, { date: "desc" }];
    case "amount_asc":
      return [{ amount: "asc" }, { date: "desc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    default:
      return [{ date: "desc" }, { createdAt: "desc" }];
  }
}

export async function listTransactions(userId: string, filters: TransactionFilters) {
  const where = await buildWhere(userId, filters);
  const [items, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: transactionListInclude,
      orderBy: orderBy(filters.sort),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.transaction.count({ where }),
  ]);
  return { items, total, page: filters.page, pageSize: filters.pageSize, pageCount: Math.max(1, Math.ceil(total / filters.pageSize)) };
}

/** Unpaginated (capped) list for exports. */
export async function listTransactionsForExport(userId: string, filters: TransactionFilters, cap = 50_000) {
  const where = await buildWhere(userId, filters);
  return db.transaction.findMany({ where, include: transactionListInclude, orderBy: orderBy(filters.sort), take: cap });
}

export async function getTransaction(userId: string, id: string) {
  const tx = await db.transaction.findFirst({ where: { id, userId }, include: transactionListInclude });
  if (!tx) throw new NotFoundError("Transaction");
  return tx;
}

export async function recentTransactions(userId: string, range: DateRange | null, take = 8) {
  return db.transaction.findMany({
    where: { userId, deletedAt: null, ...(range ? { date: { gte: range.start, lte: range.end } } : {}) },
    include: transactionListInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
}

// ---------------------------------------------------------------------------
// Validation against the user's data
// ---------------------------------------------------------------------------

type ResolvedRefs = {
  currency: string;
  destinationAmount: string | null;
};

/**
 * Verifies every referenced record belongs to the user and is usable, and derives the
 * transaction currency from the source account. `existing` relaxes the "active account"
 * rule for unchanged accounts so archived history stays editable.
 */
async function resolveReferences(client: TxClient, userId: string, data: TransactionData, existing?: { accountId: string; destinationAccountId: string | null }): Promise<ResolvedRefs> {
  const ids = [data.accountId, data.destinationAccountId].filter((v): v is string => Boolean(v));
  const accounts = await client.account.findMany({ where: { userId, id: { in: ids } } });
  const source = accounts.find((a) => a.id === data.accountId);
  if (!source) throw new AppError("Account not found", 422, { accountId: ["Account not found"] });
  if (source.status === "ARCHIVED" && existing?.accountId !== source.id) throw new AppError("This account is archived", 422, { accountId: ["Account is archived"] });

  let destinationAmount: string | null = null;
  if (data.type === "TRANSFER") {
    const dest = accounts.find((a) => a.id === data.destinationAccountId);
    if (!dest) throw new AppError("Destination account not found", 422, { destinationAccountId: ["Account not found"] });
    if (dest.status === "ARCHIVED" && existing?.destinationAccountId !== dest.id) throw new AppError("The destination account is archived", 422, { destinationAccountId: ["Account is archived"] });
    if (dest.currency !== source.currency) {
      if (!data.destinationAmount) throw new AppError(`Enter the amount received in ${dest.currency}`, 422, { destinationAmount: [`Amount received in ${dest.currency} is required`] });
      destinationAmount = roundMoney(data.destinationAmount, dest.currency).toFixed();
    }
  }

  if (data.categoryId) {
    const category = await client.category.findFirst({ where: { id: data.categoryId, userId } });
    if (!category) throw new AppError("Category not found", 422, { categoryId: ["Category not found"] });
    if (category.kind !== data.type) throw new AppError(`Choose an ${data.type.toLowerCase()} category`, 422, { categoryId: ["Category type does not match"] });
  }

  return { currency: source.currency, destinationAmount };
}

async function tagConnections(client: TxClient, userId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const tags = await Promise.all(
    unique.map((name) => client.tag.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {}, select: { id: true } })),
  );
  return tags.map((t) => ({ tagId: t.id }));
}

function baseData(data: TransactionData, refs: ResolvedRefs) {
  return {
    type: data.type,
    amount: roundMoney(data.amount, refs.currency).toFixed(),
    currency: refs.currency,
    destinationAmount: refs.destinationAmount,
    date: data.date,
    description: data.description,
    merchant: data.merchant,
    accountId: data.accountId,
    destinationAccountId: data.destinationAccountId,
    categoryId: data.categoryId,
    paymentMethod: data.paymentMethod,
    notes: data.notes,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createTransaction(userId: string, raw: unknown, client?: TxClient) {
  const data = transactionInputSchema.parse(raw);
  const run = async (tx: TxClient) => {
    const refs = await resolveReferences(tx, userId, data);
    const tags = await tagConnections(tx, userId, data.tags);
    return tx.transaction.create({ data: { ...baseData(data, refs), userId, tags: { create: tags } } });
  };
  return client ? run(client) : db.$transaction(run);
}

export async function updateTransaction(userId: string, id: string, raw: unknown) {
  const data = transactionInputSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new NotFoundError("Transaction");
    const refs = await resolveReferences(tx, userId, data, existing);
    const tags = await tagConnections(tx, userId, data.tags);
    await tx.transactionTag.deleteMany({ where: { transactionId: id } });
    return tx.transaction.update({ where: { id }, data: { ...baseData(data, refs), tags: { create: tags } } });
  });
}

/** Soft delete — removed from every calculation but restorable. */
export async function deleteTransaction(userId: string, id: string) {
  const result = await db.transaction.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (result.count === 0) throw new NotFoundError("Transaction");
}

export async function restoreTransaction(userId: string, id: string) {
  const result = await db.transaction.updateMany({ where: { id, userId, deletedAt: { not: null } }, data: { deletedAt: null } });
  if (result.count === 0) throw new NotFoundError("Transaction");
}

export async function bulkTransactions(userId: string, raw: unknown) {
  const input = bulkActionSchema.parse(raw);
  switch (input.action) {
    case "delete":
      return (await db.transaction.updateMany({ where: { userId, id: { in: input.ids }, deletedAt: null }, data: { deletedAt: new Date() } })).count;
    case "restore":
      return (await db.transaction.updateMany({ where: { userId, id: { in: input.ids }, deletedAt: { not: null } }, data: { deletedAt: null } })).count;
    case "categorize": {
      const category = await db.category.findFirst({ where: { id: input.categoryId, userId, deletedAt: null } });
      if (!category) throw new AppError("Category not found", 422);
      // Only transactions of the matching kind can take the category; transfers never do.
      return (await db.transaction.updateMany({ where: { userId, id: { in: input.ids }, deletedAt: null, type: category.kind }, data: { categoryId: category.id } })).count;
    }
  }
}

/** Distinct descriptions with their latest category, used for smart categorisation. */
export async function categorizationHistory(userId: string, take = 1500) {
  const rows = await db.transaction.findMany({
    where: { userId, deletedAt: null, categoryId: { not: null }, type: { not: "TRANSFER" } },
    select: { description: true, merchant: true, categoryId: true },
    orderBy: { date: "desc" },
    take,
  });
  return rows.map((r) => ({ description: r.merchant ? `${r.merchant} ${r.description}` : r.description, categoryId: r.categoryId! }));
}
