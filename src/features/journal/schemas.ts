import { z } from "zod";
import { dateSchema, optionalText } from "@/lib/validation";

export const JOURNAL_TYPES = ["DECISION", "REFLECTION", "UNEXPECTED_EXPENSE", "LESSON", "PRIORITY"] as const;

export const JOURNAL_TYPE_LABELS: Record<(typeof JOURNAL_TYPES)[number] | "MONTHLY_REVIEW", string> = {
  DECISION: "Financial decision",
  REFLECTION: "Reflection",
  UNEXPECTED_EXPENSE: "Unexpected expense",
  LESSON: "Lesson learned",
  PRIORITY: "Priority",
  MONTHLY_REVIEW: "Monthly review",
};

export const journalEntrySchema = z.object({
  type: z.enum(JOURNAL_TYPES),
  title: z.string().trim().min(1, "Title is required").max(120),
  content: z.string().trim().min(1, "Write something").max(10000),
  entryDate: dateSchema,
  mood: z.coerce.number().int().min(1).max(5).optional().nullable(),
  amount: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.string().regex(/^\d{1,15}(\.\d{1,4})?$/, "Enter a valid amount").nullable()),
});

export const monthlyReviewSchema = z.object({
  reviewMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month"),
  wentWell: optionalText(5000),
  toImprove: optionalText(5000),
  nextPriorities: optionalText(5000),
  content: optionalText(10000),
  mood: z.coerce.number().int().min(1).max(5).optional().nullable(),
});

export type JournalEntryInput = z.input<typeof journalEntrySchema>;
export type MonthlyReviewInput = z.input<typeof monthlyReviewSchema>;
