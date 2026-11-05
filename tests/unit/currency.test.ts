import { describe, expect, it } from "vitest";
import { createConverter } from "@/lib/currency";
import { parseDateOnly } from "@/lib/dates";

describe("currency converter", () => {
  const rates = [
    { fromCurrency: "USD", toCurrency: "IDR", rate: "15000", date: parseDateOnly("2026-01-01") },
    { fromCurrency: "USD", toCurrency: "IDR", rate: "16000", date: parseDateOnly("2026-09-01") },
    { fromCurrency: "IDR", toCurrency: "SGD", rate: "0.00008", date: parseDateOnly("2026-09-01") },
  ];
  const c = createConverter("IDR", rates);

  it("uses the latest direct rate", () => {
    expect(c.toBase("10", "USD")!.toFixed()).toBe("160000");
  });

  it("falls back to the inverse of a base→foreign rate", () => {
    expect(c.toBase("1", "SGD")!.toFixed()).toBe("12500");
  });

  it("returns null when no rate is known instead of guessing", () => {
    expect(c.toBase("1", "EUR")).toBeNull();
    expect(c.toBase("5", "IDR")!.toFixed()).toBe("5");
  });
});
