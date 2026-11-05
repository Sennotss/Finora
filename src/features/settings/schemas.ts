import { z } from "zod";
import { passwordSchema } from "@/features/auth/schemas";
import { currencySchema, dateSchema, moneySchema } from "@/lib/validation";

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const preferencesSchema = z
  .object({
    baseCurrency: currencySchema,
    locale: z.string().trim().min(2).max(20),
    timezone: z.string().trim().min(1).max(64).refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    weekStartsOn: z.coerce.number().int().min(0).max(6),
    budgetNormalThreshold: z.coerce.number().int().min(1).max(99),
    budgetModerateThreshold: z.coerce.number().int().min(1).max(99),
    budgetWarningThreshold: z.coerce.number().int().min(1).max(99),
    emergencyFundMonths: z.coerce.number().int().min(1).max(24),
    billReminderDays: z.coerce.number().int().min(0).max(30),
  })
  .refine((v) => v.budgetNormalThreshold < v.budgetModerateThreshold && v.budgetModerateThreshold < v.budgetWarningThreshold, {
    path: ["budgetWarningThreshold"],
    message: "Thresholds must increase: normal < moderate < approaching limit",
  })
  .refine((v) => {
    try {
      new Intl.NumberFormat(v.locale);
      return true;
    } catch {
      return false;
    }
  }, { path: ["locale"], message: "Unknown locale" });

export const exchangeRateSchema = z
  .object({
    fromCurrency: currencySchema,
    toCurrency: currencySchema,
    rate: moneySchema,
    date: dateSchema,
  })
  .refine((v) => v.fromCurrency !== v.toCurrency, { path: ["toCurrency"], message: "Choose two different currencies" });

export const deleteAccountSchema = z.object({ password: z.string().min(1, "Enter your password"), confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm' }) });

export const tagSchema = z.object({ name: z.string().trim().min(1).max(30), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b") });
