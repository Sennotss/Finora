import "server-only";
import { db } from "@/lib/db";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { createDefaultCategories } from "@/features/categories/service";
import { registerSchema } from "./schemas";

const LOCALE_BY_CURRENCY: Record<string, string> = { IDR: "id-ID", USD: "en-US", EUR: "de-DE", SGD: "en-SG", MYR: "ms-MY", JPY: "ja-JP", GBP: "en-GB", AUD: "en-AU" };

export async function registerUser(raw: unknown, timezone = "Asia/Jakarta") {
  const input = registerSchema.parse(raw);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
      await tx.userSettings.create({
        data: { userId: user.id, baseCurrency: input.baseCurrency, locale: LOCALE_BY_CURRENCY[input.baseCurrency] ?? "en-US", timezone },
      });
      await createDefaultCategories(tx, user.id);
      return { id: user.id, email: user.email };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("An account with this email already exists", 422, { email: ["Already registered"] });
    throw error;
  }
}
