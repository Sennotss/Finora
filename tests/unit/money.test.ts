import { describe, expect, it } from "vitest";
import { D, currencyDecimals, formatMoney, normalizeAmountInput, percentChange, percentOf, roundMoney, sum } from "@/lib/money";

describe("money", () => {
  it("adds decimals without floating point error", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(D("1234567890123.4567").plus("0.0001").toFixed()).toBe("1234567890123.4568");
  });

  it("accepts Prisma-like decimal objects via toString", () => {
    expect(D({ toString: () => "15000.5" }).toFixed()).toBe("15000.5");
    expect(D(null).isZero()).toBe(true);
  });

  it("knows zero-decimal currencies", () => {
    expect(currencyDecimals("IDR")).toBe(0);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("USD")).toBe(2);
  });

  it("formats IDR without decimals and USD with two", () => {
    expect(formatMoney("1500000", "IDR", { locale: "id-ID" }).replace(/\s/g, " ")).toBe("Rp 1.500.000");
    expect(formatMoney("1234.5", "USD", { locale: "en-US" })).toBe("$1,234.50");
  });

  it("rounds half-even to currency precision", () => {
    expect(roundMoney("10.005", "USD").toFixed(2)).toBe("10.00");
    expect(roundMoney("10.015", "USD").toFixed(2)).toBe("10.02");
    expect(roundMoney("1500.5", "IDR").toFixed()).toBe("1500");
  });

  it("returns null percentages for zero denominators", () => {
    expect(percentOf(5, 0)).toBeNull();
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(118, 100)!.toString()).toBe("18");
  });

  it("normalises locale-specific amount input", () => {
    expect(normalizeAmountInput("1.500.000", "id-ID")).toBe("1500000");
    expect(normalizeAmountInput("Rp 25.000,50", "id-ID")).toBe("25000.5");
    expect(normalizeAmountInput("1,500,000.25", "en-US")).toBe("1500000.25");
    expect(normalizeAmountInput("abc", "en-US")).toBeNull();
  });
});
