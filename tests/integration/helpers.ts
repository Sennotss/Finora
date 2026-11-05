import { db } from "@/lib/db";
import { createDefaultCategories } from "@/features/categories/service";
import { createAccount } from "@/features/accounts/service";

export async function makeUser(email = `u${Math.random().toString(36).slice(2)}@test.dev`) {
  const user = await db.user.create({ data: { name: "Test", email, passwordHash: "x", settings: { create: { baseCurrency: "IDR", timezone: "UTC" } } } });
  await db.$transaction((tx) => createDefaultCategories(tx, user.id));
  return user;
}

export async function makeAccount(userId: string, overrides: Record<string, unknown> = {}) {
  return createAccount(userId, { name: "Bank", type: "BANK", currency: "IDR", openingBalance: "0", openingDate: "2026-01-01", color: "#2a78d6", icon: "landmark", ...overrides });
}

export async function categoryId(userId: string, name: string) {
  return (await db.category.findFirstOrThrow({ where: { userId, name } })).id;
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
