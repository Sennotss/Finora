import { z } from "zod";
import { dateSchema, idSchema, moneySchema, optionalDateSchema, optionalText } from "@/lib/validation";

export const BUDGET_PERIODS = ["WEEKLY", "MONTHLY", "ANNUAL", "CUSTOM"] as const;
export const BUDGET_PERIOD_LABELS: Record<(typeof BUDGET_PERIODS)[number], string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
  CUSTOM: "Custom period",
};

export const budgetInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    period: z.enum(BUDGET_PERIODS),
    amount: moneySchema,
    startDate: dateSchema,
    endDate: optionalDateSchema,
    alertsEnabled: z.boolean().default(true),
    notes: optionalText(500),
    lines: z
      .array(z.object({ categoryId: idSchema, amount: moneySchema }))
      .max(50)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.period === "CUSTOM") {
      if (!v.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is required for a custom period" });
      else if (v.endDate.getTime() < v.startDate.getTime()) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after the start date" });
    }
    const ids = v.lines.map((l) => l.categoryId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Each category can only appear once" });
  })
  .transform((v) => (v.period === "CUSTOM" ? v : { ...v, endDate: null }));

export type BudgetInput = z.input<typeof budgetInputSchema>;
