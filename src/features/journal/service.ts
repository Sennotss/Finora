import "server-only";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { endOfMonth, formatMonth, parseDateOnly } from "@/lib/dates";
import { journalEntrySchema, monthlyReviewSchema } from "./schemas";

export async function listJournal(userId: string, options: { type?: string; q?: string } = {}) {
  return db.financialJournal.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(options.type ? { type: options.type as never } : {}),
      ...(options.q
        ? { OR: [{ title: { contains: options.q, mode: "insensitive" } }, { content: { contains: options.q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
}

export async function createJournalEntry(userId: string, raw: unknown) {
  const input = journalEntrySchema.parse(raw);
  return db.financialJournal.create({ data: { ...input, userId } });
}

export async function updateJournalEntry(userId: string, id: string, raw: unknown) {
  const input = journalEntrySchema.parse(raw);
  const r = await db.financialJournal.updateMany({ where: { id, userId, deletedAt: null, type: { not: "MONTHLY_REVIEW" } }, data: input });
  if (r.count === 0) throw new NotFoundError("Journal entry");
}

export async function deleteJournalEntry(userId: string, id: string) {
  const entry = await db.financialJournal.findFirst({ where: { id, userId, deletedAt: null } });
  if (!entry) throw new NotFoundError("Journal entry");
  // Monthly reviews are unique per month, so clear the month key to allow a fresh review later.
  await db.financialJournal.update({ where: { id }, data: { deletedAt: new Date(), reviewMonth: null } });
}

/** One review per month: creates or updates it. */
export async function saveMonthlyReview(userId: string, raw: unknown) {
  const input = monthlyReviewSchema.parse(raw);
  const monthStart = parseDateOnly(`${input.reviewMonth}-01`);
  const data = {
    title: `${formatMonth(monthStart, true)} review`,
    content: input.content ?? "",
    wentWell: input.wentWell,
    toImprove: input.toImprove,
    nextPriorities: input.nextPriorities,
    mood: input.mood ?? null,
    entryDate: endOfMonth(monthStart),
  };
  return db.financialJournal.upsert({
    where: { userId_reviewMonth: { userId, reviewMonth: input.reviewMonth } },
    create: { ...data, userId, type: "MONTHLY_REVIEW", reviewMonth: input.reviewMonth },
    update: data,
  });
}

export async function getMonthlyReview(userId: string, reviewMonth: string) {
  return db.financialJournal.findUnique({ where: { userId_reviewMonth: { userId, reviewMonth } } });
}
