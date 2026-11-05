import { z } from "zod";
import { PERIOD_PRESETS } from "@/lib/dates";
import { dateSchema, idSchema, moneySchema, optionalId, optionalText } from "@/lib/validation";

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export const PAYMENT_METHODS = ["CASH", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER", "E_WALLET", "QRIS", "OTHER"] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  CASH: "Cash",
  DEBIT_CARD: "Debit card",
  CREDIT_CARD: "Credit card",
  BANK_TRANSFER: "Bank transfer",
  E_WALLET: "E-wallet",
  QRIS: "QRIS",
  OTHER: "Other",
};

export const TRANSACTION_TYPE_LABELS: Record<(typeof TRANSACTION_TYPES)[number], string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
};

export const transactionInputSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    amount: moneySchema,
    destinationAmount: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .pipe(moneySchema.nullable()),
    date: dateSchema,
    description: z.string().trim().min(1, "Description is required").max(200),
    merchant: optionalText(120),
    accountId: idSchema,
    destinationAccountId: optionalId,
    categoryId: optionalId,
    paymentMethod: z
      .enum(PAYMENT_METHODS)
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    tags: z.array(z.string().trim().min(1).max(30)).max(10, "Up to 10 tags").default([]),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.type === "TRANSFER") {
      if (!v.destinationAccountId) ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Choose the destination account" });
      else if (v.destinationAccountId === v.accountId) ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Choose a different account" });
    }
  })
  .transform((v) =>
    v.type === "TRANSFER"
      ? { ...v, categoryId: null }
      : { ...v, destinationAccountId: null, destinationAmount: null },
  );

export type TransactionInput = z.input<typeof transactionInputSchema>;
export type TransactionData = z.output<typeof transactionInputSchema>;

export const SORT_OPTIONS = ["date_desc", "date_asc", "amount_desc", "amount_asc", "created_desc"] as const;

export const transactionFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
  account: z.string().max(64).optional().catch(undefined),
  category: z.string().max(64).optional().catch(undefined),
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
  tag: z.string().max(64).optional().catch(undefined),
  period: z.enum(PERIOD_PRESETS).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  sort: z.enum(SORT_OPTIONS).default("date_desc").catch("date_desc"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25).catch(25),
  view: z.enum(["active", "deleted"]).default("active").catch("active"),
});

export type TransactionFilters = z.output<typeof transactionFiltersSchema>;

export const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(idSchema).min(1).max(500) }),
  z.object({ action: z.literal("restore"), ids: z.array(idSchema).min(1).max(500) }),
  z.object({ action: z.literal("categorize"), ids: z.array(idSchema).min(1).max(500), categoryId: idSchema }),
]);
