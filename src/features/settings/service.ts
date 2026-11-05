import "server-only";
import { db } from "@/lib/db";
import { AppError, NotFoundError, isUniqueViolation } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { deleteAccountSchema, exchangeRateSchema, passwordChangeSchema, preferencesSchema, profileSchema, tagSchema } from "./schemas";

export async function getSettings(userId: string) {
  const [user, settings, rates, tags] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, createdAt: true } }),
    db.userSettings.upsert({ where: { userId }, create: { userId }, update: {} }),
    db.exchangeRate.findMany({ where: { userId }, orderBy: [{ fromCurrency: "asc" }, { date: "desc" }] }),
    db.tag.findMany({ where: { userId }, orderBy: { name: "asc" }, include: { _count: { select: { transactions: true } } } }),
  ]);
  return { user, settings, rates, tags };
}

export async function updateProfile(userId: string, raw: unknown) {
  const input = profileSchema.parse(raw);
  try {
    await db.user.update({ where: { id: userId }, data: input });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("That email is already in use", 422, { email: ["Already in use"] });
    throw error;
  }
}

/** Changing the password bumps the session version, signing out every other session. */
export async function changePassword(userId: string, raw: unknown) {
  const input = passwordChangeSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw new AppError("Current password is incorrect", 422, { currentPassword: ["Incorrect password"] });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword), sessionVersion: { increment: 1 } } });
}

export async function updatePreferences(userId: string, raw: unknown) {
  const input = preferencesSchema.parse(raw);
  await db.userSettings.upsert({ where: { userId }, create: { userId, ...input }, update: input });
}

export async function saveExchangeRate(userId: string, raw: unknown) {
  const input = exchangeRateSchema.parse(raw);
  await db.exchangeRate.upsert({
    where: { userId_fromCurrency_toCurrency_date: { userId, fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, date: input.date } },
    create: { ...input, userId },
    update: { rate: input.rate },
  });
}

export async function deleteExchangeRate(userId: string, id: string) {
  const r = await db.exchangeRate.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new NotFoundError("Exchange rate");
}

export async function createTag(userId: string, raw: unknown) {
  const input = tagSchema.parse(raw);
  try {
    await db.tag.create({ data: { ...input, userId } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("Tag already exists", 422, { name: ["Already exists"] });
    throw error;
  }
}

export async function deleteTag(userId: string, id: string) {
  const r = await db.tag.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new NotFoundError("Tag");
}

/** Permanently deletes the user and all their data (cascade). */
export async function deleteUserAccount(userId: string, raw: unknown) {
  const input = deleteAccountSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.password))) throw new AppError("Password is incorrect", 422, { password: ["Incorrect password"] });
  // Transactions restrict account deletion, so remove them first inside one transaction.
  await db.$transaction([
    db.billPayment.deleteMany({ where: { userId } }),
    db.transaction.deleteMany({ where: { userId } }),
    db.user.delete({ where: { id: userId } }),
  ]);
}
