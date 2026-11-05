import { describe, expect, it } from "vitest";
import { goalProgress } from "@/features/goals/calculations";
import { formatDateOnly } from "@/lib/dates";
import { D } from "@/lib/money";
import { d } from "./helpers";

const c = (type: "CONTRIBUTION" | "WITHDRAWAL", amount: string, date: string) => ({ type, amount: D(amount), date: d(date) });

describe("goal progress", () => {
  it("computes remaining amount and required monthly savings", () => {
    const p = goalProgress(
      { targetAmount: D(12000000), targetDate: d("2027-04-29"), createdAt: d("2026-07-01") },
      [c("CONTRIBUTION", "2000000", "2026-07-01"), c("CONTRIBUTION", "1000000", "2026-09-01"), c("WITHDRAWAL", "500000", "2026-10-01")],
      d("2026-10-29"),
    );
    expect(p.current.toFixed()).toBe("2500000");
    expect(p.remaining.toFixed()).toBe("9500000");
    expect(p.monthsRemaining).toBe(6);
    expect(p.requiredMonthly!.toDecimalPlaces(0).toFixed()).toBe("1583333");
    expect(p.isCompleted).toBe(false);
    expect(p.isOverdue).toBe(false);
  });

  it("handles completed goals", () => {
    const p = goalProgress({ targetAmount: D(100), targetDate: d("2026-01-01"), createdAt: d("2025-01-01") }, [c("CONTRIBUTION", "150", "2025-06-01")], d("2026-10-29"));
    expect(p.isCompleted).toBe(true);
    expect(p.isOverdue).toBe(false);
    expect(p.remaining.toFixed()).toBe("0");
    expect(p.requiredMonthly).toBeNull();
    expect(p.percent.toFixed()).toBe("150");
  });

  it("flags overdue goals and requires the full remainder now", () => {
    const p = goalProgress({ targetAmount: D(1000), targetDate: d("2026-09-30"), createdAt: d("2026-01-01") }, [c("CONTRIBUTION", "400", "2026-02-01")], d("2026-10-29"));
    expect(p.isOverdue).toBe(true);
    expect(p.monthsRemaining).toBe(0);
    expect(p.requiredMonthly!.toFixed()).toBe("600");
  });

  it("works without a target date and estimates completion from the recent pace", () => {
    const p = goalProgress(
      { targetAmount: D(3000), targetDate: null, createdAt: d("2026-07-01") },
      [c("CONTRIBUTION", "300", "2026-08-01"), c("CONTRIBUTION", "300", "2026-09-01"), c("CONTRIBUTION", "300", "2026-10-01")],
      d("2026-10-29"),
    );
    expect(p.requiredMonthly).toBeNull();
    expect(p.onTrack).toBeNull();
    expect(p.estimatedCompletionDate).not.toBeNull();
    expect(p.averageMonthlyContribution.greaterThan(0)).toBe(true);
    // ~2100 remaining at ~300/month → roughly 7 months out.
    expect(formatDateOnly(p.estimatedCompletionDate!).slice(0, 7)).toMatch(/2027-0[5-6]/);
  });

  it("gives no completion estimate when the pace is not positive", () => {
    const p = goalProgress({ targetAmount: D(1000), targetDate: null, createdAt: d("2026-01-01") }, [], d("2026-10-29"));
    expect(p.estimatedCompletionDate).toBeNull();
  });
});
