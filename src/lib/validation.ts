import { z } from "zod";
import { isValidDateString, parseDateOnly } from "./dates";
import { D } from "./money";

const MONEY_RE = /^\d{1,15}(\.\d{1,4})?$/;
const SIGNED_MONEY_RE = /^-?\d{1,15}(\.\d{1,4})?$/;

/** Positive decimal amount as a canonical string ("1500000", "12.5"). */
export const moneySchema = z
  .string({ error: "Amount is required" })
  .trim()
  .regex(MONEY_RE, "Enter a valid amount (up to 4 decimal places)")
  .refine((v) => D(v).greaterThan(0), "Amount must be greater than zero");

export const nonNegativeMoneySchema = z.string().trim().regex(MONEY_RE, "Enter a valid amount");

export const signedMoneySchema = z.string().trim().regex(SIGNED_MONEY_RE, "Enter a valid amount");

/** YYYY-MM-DD → UTC-midnight Date. */
export const dateSchema = z
  .string({ error: "Date is required" })
  .trim()
  .refine(isValidDateString, "Enter a valid date")
  .transform((v) => parseDateOnly(v));

export const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!isValidDateString(v)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return parseDateOnly(v);
  });

/** Optional text: empty strings become null. */
export function optionalText(max = 500) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
}

export const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v && v !== "none" ? v : null));

export const idSchema = z.string().trim().min(1, "Required").max(64);

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3b82f6");

export const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");
