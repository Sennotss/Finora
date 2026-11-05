import { z } from "zod";
import { colorSchema, currencySchema, dateSchema, moneySchema, optionalText, signedMoneySchema } from "@/lib/validation";

export const ACCOUNT_TYPES = ["CASH", "BANK", "E_WALLET", "SAVINGS", "INVESTMENT", "CREDIT_CARD", "LOAN", "OTHER"] as const;

export const ACCOUNT_ICONS = ["wallet", "landmark", "smartphone", "piggy-bank", "trending-up", "credit-card", "hand-coins", "banknote", "briefcase", "circle-dollar-sign"] as const;

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.enum(ACCOUNT_TYPES),
  currency: currencySchema,
  /** Signed: liabilities are entered as amounts owed and stored as negative balances. */
  openingBalance: signedMoneySchema.default("0"),
  openingDate: dateSchema,
  institution: optionalText(80),
  color: colorSchema,
  icon: z.enum(ACCOUNT_ICONS).default("wallet"),
  creditLimit: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(moneySchema.nullable()),
  notes: optionalText(500),
});

export type AccountInput = z.input<typeof accountInputSchema>;

export const reconcileSchema = z.object({
  actualBalance: signedMoneySchema,
  date: dateSchema,
  note: optionalText(200),
});
