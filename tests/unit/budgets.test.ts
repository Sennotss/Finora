import { describe, expect, it } from "vitest";
import { budgetPeriodRange, budgetSpending, budgetStatus, evaluateBudget } from "@/features/budgets/calculations";
import { identityConverter } from "@/lib/currency";
import { formatDateOnly } from "@/lib/dates";
import { D } from "@/lib/money";
import { d, tx } from "./helpers";

const f = formatDateOnly;

describe("budget status thresholds", () => {
  it("maps utilisation to the configured statuses", () => {
    const t = { normal: 50, moderate: 75, warning: 90 };
    expect(budgetStatus(D(10), t)).toBe("healthy");
    expect(budgetStatus(D(50), t)).toBe("normal");
    expect(budgetStatus(D(80), t)).toBe("moderate");
    expect(budgetStatus(D(95), t)).toBe("warning");
    expect(budgetStatus(D(100), t)).toBe("reached");
    expect(budgetStatus(D("100.01"), t)).toBe("exceeded");
    expect(budgetStatus(D(80), { normal: 40, moderate: 60, warning: 80 })).toBe("warning");
  });
});

describe("budget periods", () => {
  it("follows calendar months for budgets starting on the 1st", () => {
    const r = budgetPeriodRange({ period: "MONTHLY", startDate: d("2026-01-01"), endDate: null }, d("2026-10-29"));
    expect([f(r.start), f(r.end)]).toEqual(["2026-10-01", "2026-10-31"]);
  });

  it("supports pay-cycle months anchored on another day", () => {
    const r = budgetPeriodRange({ period: "MONTHLY", startDate: d("2026-01-25"), endDate: null }, d("2026-10-10"));
    expect([f(r.start), f(r.end)]).toEqual(["2026-09-25", "2026-10-24"]);
  });

  it("supports weekly, annual and custom budgets", () => {
    const w = budgetPeriodRange({ period: "WEEKLY", startDate: d("2026-10-05"), endDate: null }, d("2026-10-29"));
    expect([f(w.start), f(w.end)]).toEqual(["2026-10-26", "2026-11-01"]);
    const a = budgetPeriodRange({ period: "ANNUAL", startDate: d("2026-01-01"), endDate: null }, d("2026-10-29"));
    expect([f(a.start), f(a.end)]).toEqual(["2026-01-01", "2026-12-31"]);
    const c = budgetPeriodRange({ period: "CUSTOM", startDate: d("2026-12-01"), endDate: d("2026-12-31") }, d("2026-10-29"));
    expect([f(c.start), f(c.end)]).toEqual(["2026-12-01", "2026-12-31"]);
  });
});

describe("budget evaluation", () => {
  it("projects month-end spending from the current pace", () => {
    const range = { start: d("2026-10-01"), end: d("2026-10-31") };
    const e = evaluateBudget(D(3100000), D(1000000), range, d("2026-10-10"));
    expect(e.percent!.toDecimalPlaces(2).toFixed()).toBe("32.26");
    expect(e.projected.toFixed()).toBe("3100000");
    expect(e.remaining.toFixed()).toBe("2100000");
    // 22 days left including today.
    expect(e.dailyAllowance!.toDecimalPlaces(0).toFixed()).toBe("95455");
  });

  it("counts parent-category lines including subcategories, once per transaction", () => {
    const categories = [
      { id: "food", parentId: null },
      { id: "resto", parentId: "food" },
      { id: "fun", parentId: null },
    ];
    const txs = [
      tx({ type: "EXPENSE", amount: "100", categoryId: "resto", date: "2026-10-02" }),
      tx({ type: "EXPENSE", amount: "50", categoryId: "food", date: "2026-10-02" }),
      tx({ type: "EXPENSE", amount: "70", categoryId: "fun", date: "2026-10-02" }),
      tx({ type: "TRANSFER", amount: "1000", date: "2026-10-02", destinationAccountId: "x" }),
    ];
    const range = { start: d("2026-10-01"), end: d("2026-10-31") };
    const lines = [
      { categoryId: "food", amount: D(500) },
      { categoryId: "resto", amount: D(200) },
    ];
    const s = budgetSpending(lines, txs, categories, range, identityConverter("IDR"));
    expect(s.total.toFixed()).toBe("150");
    expect(s.byCategory.get("food")!.toFixed()).toBe("150");
    expect(s.byCategory.get("resto")!.toFixed()).toBe("100");
    expect(budgetSpending([], txs, categories, range, identityConverter("IDR")).total.toFixed()).toBe("220");
  });
});
