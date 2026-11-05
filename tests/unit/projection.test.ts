import { describe, expect, it } from "vitest";
import { EMPTY_SCENARIO, projectScenario, type Baseline } from "@/features/planning/projection";

const baseline: Baseline = {
  currency: "IDR",
  startMonth: "2026-10-01",
  startingCash: "10000000",
  startingNetWorth: "50000000",
  monthsOfHistory: 6,
  avgVariableIncome: "9000000",
  recurringIncome: "1000000",
  recurringExpense: "2000000",
  expenseCategories: [
    { id: "food", name: "Food", monthly: "3000000" },
    { id: "fun", name: "Fun", monthly: "1000000" },
  ],
  avgMonthlyExpense: "6000000",
  emergencyFundGoal: null,
  monthlyBudgetTotal: "6500000",
  goals: [{ id: "g1", name: "Laptop", priority: "HIGH", remaining: "12000000", averageMonthlyContribution: "1000000", targetDate: "2027-06-01", isCompleted: false, isEmergencyFund: false }],
};

describe("projection", () => {
  it("projects the baseline from averages and recurring amounts", () => {
    const p = projectScenario(baseline, EMPTY_SCENARIO, 3);
    expect(p.months.map((m) => m.net.toFixed())).toEqual(["4000000", "4000000", "4000000"]);
    expect(p.endCash.toFixed()).toBe("22000000");
    expect(p.endNetWorth.toFixed()).toBe("62000000");
    expect(p.budgetSustainable).toBe(true);
    expect(p.goals[0].months).toBe(12);
  });

  it("applies what-if adjustments without mutating the baseline", () => {
    const snapshot = JSON.stringify(baseline);
    const p = projectScenario(
      baseline,
      {
        ...EMPTY_SCENARIO,
        incomeChangePct: 10,
        categoryChangePct: { food: -15 },
        extraSavingsMonthly: "500000",
        plannedPurchases: [{ id: "l", label: "Laptop", amount: "12000000", month: 2 }],
      },
      3,
    );
    // income 11,000,000; expense 2,550,000 + 1,000,000 + 2,000,000 − 500,000 = 5,050,000
    expect(p.months[0].net.toFixed()).toBe("5950000");
    expect(p.months[1].net.toFixed()).toBe("-6050000");
    expect(p.goals[0].months).toBe(8); // 12,000,000 / 1,500,000
    expect(JSON.stringify(baseline)).toBe(snapshot);
  });

  it("models a temporary loss of income and detects negative cash", () => {
    const p = projectScenario(baseline, { ...EMPTY_SCENARIO, incomeLoss: { months: 3, startMonth: 1, pct: 100 } }, 6);
    expect(p.months[0].income.toFixed()).toBe("0");
    expect(p.months[3].income.toFixed()).toBe("10000000");
    expect(p.firstNegativeMonth).toBe(2);
    expect(p.minCash.toFixed()).toBe("-8000000");
  });
});
