import { z } from "zod";
import { colorSchema, dateSchema, moneySchema, optionalDateSchema, optionalId, optionalText } from "@/lib/validation";

export const GOAL_CATEGORIES = ["EMERGENCY_FUND", "PURCHASE", "VACATION", "EDUCATION", "HOME", "GENERAL"] as const;
export const GOAL_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

export const GOAL_CATEGORY_LABELS: Record<(typeof GOAL_CATEGORIES)[number], string> = {
  EMERGENCY_FUND: "Emergency fund",
  PURCHASE: "Purchase",
  VACATION: "Vacation",
  EDUCATION: "Education",
  HOME: "Home",
  GENERAL: "General savings",
};

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  category: z.enum(GOAL_CATEGORIES).default("GENERAL"),
  targetAmount: moneySchema,
  targetDate: optionalDateSchema,
  priority: z.enum(GOAL_PRIORITIES).default("MEDIUM"),
  linkedAccountId: optionalId,
  description: optionalText(300),
  notes: optionalText(1000),
  color: colorSchema.default("#10b981"),
  /** Only used on create: records an initial contribution. */
  initialAmount: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v !== "0" ? v : null))
    .pipe(moneySchema.nullable()),
});

export type GoalInput = z.input<typeof goalInputSchema>;

export const contributionInputSchema = z.object({
  type: z.enum(["CONTRIBUTION", "WITHDRAWAL"]),
  amount: moneySchema,
  date: dateSchema,
  note: optionalText(200),
});
