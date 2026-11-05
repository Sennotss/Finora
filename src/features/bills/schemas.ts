import { z } from "zod";
import { currencySchema, dateSchema, moneySchema, optionalDateSchema, optionalId, optionalText } from "@/lib/validation";

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "CUSTOM"] as const;

const urlSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.string().url("Enter a valid URL").refine((u) => /^https?:\/\//.test(u), "Use an http(s) URL").max(300).nullable());

export const billInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  amount: moneySchema,
  currency: currencySchema,
  accountId: optionalId,
  categoryId: optionalId,
  frequency: z.enum(FREQUENCIES),
  interval: z.coerce.number().int().min(1, "At least 1").max(365).default(1),
  nextDueDate: dateSchema,
  endDate: optionalDateSchema,
  isSubscription: z.boolean().default(false),
  reminderDays: z.coerce.number().int().min(0).max(30).default(3),
  isActive: z.boolean().default(true),
  url: urlSchema,
  notes: optionalText(500),
});

export type BillInput = z.input<typeof billInputSchema>;

export const payBillSchema = z.object({
  /** The due date being settled, as shown to the user; guards against double payment. */
  dueDate: optionalDateSchema,
  paidDate: dateSchema,
  amount: moneySchema,
  accountId: optionalId,
  recordTransaction: z.boolean().default(true),
});

export const recurringInputSchema = z
  .object({
    description: z.string().trim().min(1, "Description is required").max(200),
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    amount: moneySchema,
    accountId: z.string().min(1, "Choose an account"),
    destinationAccountId: optionalId,
    categoryId: optionalId,
    paymentMethod: z
      .enum(["CASH", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER", "E_WALLET", "QRIS", "OTHER"])
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    frequency: z.enum(FREQUENCIES),
    interval: z.coerce.number().int().min(1).max(365).default(1),
    startDate: dateSchema,
    endDate: optionalDateSchema,
    isActive: z.boolean().default(true),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.type === "TRANSFER" && (!v.destinationAccountId || v.destinationAccountId === v.accountId)) {
      ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Choose a different destination account" });
    }
    if (v.endDate && v.endDate.getTime() < v.startDate.getTime()) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after the start date" });
  })
  .transform((v) => (v.type === "TRANSFER" ? { ...v, categoryId: null } : { ...v, destinationAccountId: null }));

export type RecurringInput = z.input<typeof recurringInputSchema>;
