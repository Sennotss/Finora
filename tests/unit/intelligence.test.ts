import { describe, expect, it } from "vitest";
import { computeHealthScore } from "@/features/analytics/health-score";
import { detectCategorySpikes, detectLargeTransactions, detectRecurringAnomalies, findRecurringPatterns, modifiedZScore, median, mad } from "@/features/insights/anomalies";
import { normalizeDescription, suggestCategory } from "@/features/insights/categorize";
import { generateInsights, type InsightContext } from "@/features/insights/insights";
import { identityConverter } from "@/lib/currency";
import { D } from "@/lib/money";
import { tx } from "./helpers";

const idr = identityConverter("IDR");

describe("robust statistics", () => {
  it("computes median, MAD and the modified z-score", () => {
    const values = [10, 12, 11, 13, 12, 100].map((v) => D(v));
    const med = median(values);
    expect(med.toFixed()).toBe("12");
    expect(mad(values, med).toFixed()).toBe("1");
    expect(modifiedZScore(D(100), med, D(1))!.toFixed(2)).toBe("59.36");
  });
});

describe("anomaly detection", () => {
  const history = Array.from({ length: 10 }, (_, i) => tx({ type: "EXPENSE", amount: 50000 + i * 2000, categoryId: "food", date: `2026-0${(i % 8) + 1}-10` }));

  it("flags an expense far above the category's typical amount", () => {
    const recent = [tx({ id: "big", type: "EXPENSE", amount: "450000", categoryId: "food", date: "2026-10-01" }), tx({ id: "normal", type: "EXPENSE", amount: "56000", categoryId: "food", date: "2026-10-02" })];
    const found = detectLargeTransactions(recent, history, idr, () => "Food");
    expect(found.map((a) => a.transactionId)).toEqual(["big"]);
    expect(found[0].title).not.toMatch(/fraud/i);
  });

  it("skips detection without enough history", () => {
    expect(detectLargeTransactions([tx({ type: "EXPENSE", amount: "1000000", date: "2026-10-01" })], history.slice(0, 3), idr, () => "x")).toEqual([]);
  });

  it("flags category spikes only above both relative and absolute thresholds", () => {
    const current = new Map<string | null, ReturnType<typeof D>>([["food", D(3000000)], ["fun", D(30000)]]);
    const prior = [new Map([["food", D(1500000)], ["fun", D(10000)]]), new Map([["food", D(1700000)], ["fun", D(10000)]])];
    const found = detectCategorySpikes(current, prior, (id) => String(id), D(100000));
    expect(found.map((a) => a.categoryId)).toEqual(["food"]);
  });

  it("detects untracked monthly subscriptions and price increases", () => {
    const txs = [
      tx({ type: "EXPENSE", amount: "54990", description: "NETFLIX.COM 123", date: "2026-07-03" }),
      tx({ type: "EXPENSE", amount: "54990", description: "Netflix.com 456", date: "2026-08-03" }),
      tx({ type: "EXPENSE", amount: "54990", description: "NETFLIX.COM", date: "2026-09-03" }),
      tx({ type: "EXPENSE", amount: "65990", description: "NETFLIX.COM", date: "2026-10-03" }),
    ];
    const patterns = findRecurringPatterns(txs, idr);
    expect(patterns).toHaveLength(1);
    const kinds = detectRecurringAnomalies(patterns).map((a) => a.kind);
    expect(kinds).toContain("untracked_recurring");
    expect(kinds).toContain("price_increase");
  });
});

describe("smart categorisation", () => {
  const categories = [
    { id: "food", name: "Food & Dining", kind: "EXPENSE" as const },
    { id: "transport", name: "Transportation", kind: "EXPENSE" as const },
    { id: "salary", name: "Salary", kind: "INCOME" as const },
  ];

  it("normalises noisy merchant strings", () => {
    expect(normalizeDescription("POS PURCHASE GRAB* A-12345 Jakarta")).toBe("grab jakarta");
  });

  it("prefers the user's own history", () => {
    const s = suggestCategory("Kopi Kenangan", "EXPENSE", [{ description: "kopi kenangan", categoryId: "food" }, { description: "KOPI KENANGAN #22", categoryId: "food" }], categories);
    expect(s?.categoryId).toBe("food");
    expect(s?.confidence).toBe("high");
  });

  it("falls back to keyword rules and respects the transaction kind", () => {
    expect(suggestCategory("Gojek ride to office", "EXPENSE", [], categories)?.categoryId).toBe("transport");
    expect(suggestCategory("Gaji Oktober", "INCOME", [], categories)?.categoryId).toBe("salary");
    expect(suggestCategory("Gaji Oktober", "EXPENSE", [], categories)).toBeNull();
    expect(suggestCategory("zzqx", "EXPENSE", [], categories)).toBeNull();
  });
});

describe("financial health score", () => {
  const months = Array.from({ length: 6 }, () => ({ income: D(10000000), expense: D(7000000) }));

  it("scores each indicator transparently and rescales over available data", () => {
    const s = computeHealthScore({ months, emergencyFund: D(21000000), emergencyFundTargetMonths: 6, assets: D(50000000), liabilities: D(5000000), budgetUtilisation: [] });
    const byKey = Object.fromEntries(s.components.map((c) => [c.key, c.points]));
    expect(byKey.savingRate).toBe(25); // 30% ≥ 20%
    expect(byKey.emergencyFund).toBe(12.5); // 3 of 6 months
    expect(byKey.debtToAsset).toBe(20); // 10%
    expect(byKey.cashFlowStability).toBe(15);
    expect(byKey.budgetAdherence).toBeNull();
    expect(s.availableWeight).toBe(85);
    expect(s.score).toBe(85); // 72.5 / 85
  });

  it("refuses to score without enough data", () => {
    const s = computeHealthScore({ months: [], emergencyFund: D(0), emergencyFundTargetMonths: 6, assets: D(0), liabilities: D(0), budgetUtilisation: [] });
    expect(s.score).toBeNull();
    expect(s.grade).toBe("Insufficient data");
  });
});

describe("insights", () => {
  const base: InsightContext = {
    formatMoney: (v) => v.toFixed(0),
    periodLabel: "This month",
    comparisonLabel: "last month",
    current: { income: D(10000000), expense: D(7600000), net: D(2400000), savingRate: D(24), transactionCount: 10, missingCurrencies: [] },
    previous: { income: D(10000000), expense: D(6440678), net: D(0), savingRate: D(35), transactionCount: 10, missingCurrencies: [] },
    topExpenseCategory: { name: "Food & Dining", amount: D(2000000), share: D(26) },
    categoryChanges: [],
    budgets: [],
    emergencyFundMonths: D("3.5"),
    emergencyFundTargetMonths: 6,
    recentMonths: [],
    goalsBehind: [],
    overdueBills: 0,
  };

  it("derives messages from the actual figures", () => {
    const messages = generateInsights(base).map((i) => i.message);
    expect(messages).toContain("Your expenses increased by 18% compared to last month (7600000 vs 6440678).");
    expect(messages.some((m) => m.startsWith("Your largest expense category is Food & Dining"))).toBe(true);
    expect(messages.some((m) => m.startsWith("Your saving rate is 24%"))).toBe(true);
    expect(messages.some((m) => m.startsWith("Your emergency fund currently covers 3.5 months"))).toBe(true);
  });

  it("produces nothing when there is no data", () => {
    const empty: InsightContext = {
      ...base,
      current: { ...base.current, income: D(0), expense: D(0), savingRate: null },
      previous: { ...base.previous, income: D(0), expense: D(0), savingRate: null },
      topExpenseCategory: null,
      emergencyFundMonths: null,
    };
    expect(generateInsights(empty)).toEqual([]);
  });
});
