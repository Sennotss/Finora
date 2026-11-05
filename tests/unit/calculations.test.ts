import { describe, expect, it } from "vitest";
import {
  averageDailyExpense,
  balancesFromDeltas,
  cashFlowSeries,
  cashFlowTotals,
  categoryBreakdown,
  deltasFromTransactions,
  netWorthSeries,
  savingRate,
  spendingByWeekday,
  summarizePosition,
} from "@/features/analytics/calculations";
import { createConverter, identityConverter } from "@/lib/currency";
import { D } from "@/lib/money";
import { account, d, tx } from "./helpers";

const idr = identityConverter("IDR");

describe("cash flow totals", () => {
  const txs = [
    tx({ type: "INCOME", amount: "10000000", date: "2026-10-01", accountId: "bank" }),
    tx({ type: "EXPENSE", amount: "2500000", date: "2026-10-03", accountId: "bank" }),
    // Credit card purchase: an expense, counted once.
    tx({ type: "EXPENSE", amount: "500000", date: "2026-10-05", accountId: "card" }),
    // Credit card repayment: a transfer, NOT a second expense.
    tx({ type: "TRANSFER", amount: "500000", date: "2026-10-20", accountId: "bank", destinationAccountId: "card" }),
    // Reconciliation adjustment: changes balance only.
    tx({ type: "EXPENSE", amount: "12345", date: "2026-10-21", accountId: "bank", isAdjustment: true }),
  ];

  it("excludes transfers and adjustments from income and expense", () => {
    const t = cashFlowTotals(txs, idr);
    expect(t.income.toFixed()).toBe("10000000");
    expect(t.expense.toFixed()).toBe("3000000");
    expect(t.net.toFixed()).toBe("7000000");
    expect(t.savingRate!.toFixed()).toBe("70");
  });

  it("returns a null saving rate when there is no income", () => {
    expect(savingRate(D(0), D(100))).toBeNull();
    expect(savingRate(D(100), D(150))!.toFixed()).toBe("-50");
  });

  it("reports amounts in currencies without a rate instead of dropping them silently", () => {
    const t = cashFlowTotals([tx({ type: "EXPENSE", amount: "10", currency: "EUR", date: "2026-10-01" })], idr);
    expect(t.expense.toFixed()).toBe("0");
    expect(t.missingCurrencies).toEqual(["EUR"]);
  });

  it("converts foreign-currency amounts to the base currency", () => {
    const conv = createConverter("IDR", [{ fromCurrency: "USD", toCurrency: "IDR", rate: "16000", date: d("2026-01-01") }]);
    const t = cashFlowTotals([tx({ type: "EXPENSE", amount: "12.50", currency: "USD", date: "2026-10-01" })], conv);
    expect(t.expense.toFixed()).toBe("200000");
  });
});

describe("balances and net worth", () => {
  const accounts = [
    account({ id: "bank", type: "BANK", openingBalance: "5000000", openingDate: "2026-08-01" }),
    account({ id: "card", type: "CREDIT_CARD", openingBalance: "0", openingDate: "2026-08-01" }),
    account({ id: "inv", type: "INVESTMENT", openingBalance: "20000000", openingDate: "2026-10-01" }),
  ];
  const txs = [
    tx({ type: "INCOME", amount: "10000000", date: "2026-08-25", accountId: "bank" }),
    tx({ type: "EXPENSE", amount: "3000000", date: "2026-09-05", accountId: "card" }),
    tx({ type: "TRANSFER", amount: "1000000", date: "2026-09-25", accountId: "bank", destinationAccountId: "card" }),
    tx({ type: "TRANSFER", amount: "2000000", date: "2026-10-02", accountId: "bank", destinationAccountId: "inv" }),
  ];
  const deltas = deltasFromTransactions(txs);

  it("applies income, expenses and both legs of transfers", () => {
    const b = balancesFromDeltas(accounts, deltas);
    expect(b.get("bank")!.toFixed()).toBe("12000000");
    expect(b.get("card")!.toFixed()).toBe("-2000000");
    expect(b.get("inv")!.toFixed()).toBe("22000000");
  });

  it("splits assets and liabilities and computes net worth", () => {
    const p = summarizePosition(accounts, balancesFromDeltas(accounts, deltas), idr);
    expect(p.assets.toFixed()).toBe("34000000");
    expect(p.liabilities.toFixed()).toBe("2000000");
    expect(p.netWorth.toFixed()).toBe("32000000");
    expect(p.liquid.toFixed()).toBe("12000000");
  });

  it("reconstructs historical net worth from transactions, not current balances", () => {
    const series = netWorthSeries(accounts, deltas, [d("2026-08-01"), d("2026-09-01"), d("2026-10-01")], idr);
    expect(series.map((p) => p.netWorth.toFixed())).toEqual(["15000000", "12000000", "32000000"]);
    // The investment account opened in October does not inflate earlier months.
    expect(series[1].assets.toFixed()).toBe("14000000");
    expect(series[1].liabilities.toFixed()).toBe("2000000");
  });

  it("handles cross-currency transfers using the destination amount", () => {
    const accs = [account({ id: "idr", currency: "IDR", openingBalance: "1000000" }), account({ id: "usd", currency: "USD" })];
    const t = [tx({ type: "TRANSFER", amount: "800000", destinationAmount: "50", accountId: "idr", destinationAccountId: "usd", date: "2026-10-01" })];
    const b = balancesFromDeltas(accs, deltasFromTransactions(t));
    expect(b.get("idr")!.toFixed()).toBe("200000");
    expect(b.get("usd")!.toFixed()).toBe("50");
  });
});

describe("series and breakdowns", () => {
  const txs = [
    tx({ type: "INCOME", amount: "100", date: "2026-10-01" }),
    tx({ type: "EXPENSE", amount: "30", date: "2026-10-01", categoryId: "food-sub" }),
    tx({ type: "EXPENSE", amount: "20", date: "2026-10-03", categoryId: "food" }),
    tx({ type: "EXPENSE", amount: "50", date: "2026-10-03", categoryId: "transport" }),
    tx({ type: "EXPENSE", amount: "999", date: "2026-11-01", categoryId: "transport" }),
  ];
  const categories = [
    { id: "food", name: "Food", kind: "EXPENSE" as const, parentId: null, color: "#f00", icon: "x" },
    { id: "food-sub", name: "Restaurants", kind: "EXPENSE" as const, parentId: "food", color: "#f00", icon: "x" },
    { id: "transport", name: "Transport", kind: "EXPENSE" as const, parentId: null, color: "#00f", icon: "x" },
  ];

  it("zero-fills daily buckets within the range only", () => {
    const series = cashFlowSeries(txs, { start: d("2026-10-01"), end: d("2026-10-04") }, "day", idr);
    expect(series).toHaveLength(4);
    expect(series.map((b) => b.expense.toFixed())).toEqual(["30", "0", "70", "0"]);
    expect(series[0].net.toFixed()).toBe("70");
  });

  it("clips week buckets to the requested range", () => {
    const series = cashFlowSeries(txs, { start: d("2026-10-01"), end: d("2026-10-31") }, "week", idr, 1);
    expect(series[0].start.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(series.reduce((a, b) => a.plus(b.expense), D(0)).toFixed()).toBe("100");
  });

  it("rolls subcategories up into their parent", () => {
    const rows = categoryBreakdown(txs.slice(0, 4), categories, idr);
    expect(rows.map((r) => [r.name, r.amount.toFixed(), r.share.toFixed()])).toEqual([
      ["Food", "50", "50"],
      ["Transport", "50", "50"],
    ]);
    const detailed = categoryBreakdown(txs.slice(0, 4), categories, idr, { rollup: false });
    expect(detailed).toHaveLength(3);
  });

  it("averages daily spending over elapsed days only", () => {
    const avg = averageDailyExpense(txs, { start: d("2026-10-01"), end: d("2026-10-31") }, idr, d("2026-10-04"));
    expect(avg.toFixed()).toBe("25");
  });

  it("averages weekday spending per calendar occurrence", () => {
    const rows = spendingByWeekday(txs, { start: d("2026-10-01"), end: d("2026-10-14") }, idr);
    // 2026-10-01 is a Thursday (4); there are two Thursdays in the range.
    expect(rows[4].total.toFixed()).toBe("30");
    expect(rows[4].average.toFixed()).toBe("15");
  });
});
