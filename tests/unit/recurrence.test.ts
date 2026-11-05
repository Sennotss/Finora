import { describe, expect, it } from "vitest";
import { formatDateOnly, parseDateOnly } from "@/lib/dates";
import { monthlyEquivalent, nextOccurrence, occurrencesUntil } from "@/lib/recurrence";

const d = parseDateOnly;

describe("recurrence", () => {
  it("keeps the anchor day for monthly rules across short months", () => {
    const rule = { frequency: "MONTHLY" as const, interval: 1, anchorDay: 31 };
    const dates = occurrencesUntil(d("2026-01-31"), rule, d("2026-05-01")).map(formatDateOnly);
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("supports weekly, quarterly and custom intervals", () => {
    expect(formatDateOnly(nextOccurrence(d("2026-10-01"), { frequency: "WEEKLY", interval: 2 }))).toBe("2026-10-15");
    expect(formatDateOnly(nextOccurrence(d("2026-10-01"), { frequency: "QUARTERLY", interval: 1 }))).toBe("2027-01-01");
    expect(formatDateOnly(nextOccurrence(d("2026-10-01"), { frequency: "CUSTOM", interval: 10 }))).toBe("2026-10-11");
  });

  it("respects end dates", () => {
    const dates = occurrencesUntil(d("2026-01-01"), { frequency: "MONTHLY", interval: 1 }, d("2026-12-31"), d("2026-03-15"));
    expect(dates).toHaveLength(3);
  });

  it("normalises amounts to a monthly equivalent", () => {
    expect(monthlyEquivalent("1200000", { frequency: "ANNUALLY", interval: 1 }).toFixed(0)).toBe("100000");
    expect(monthlyEquivalent("300000", { frequency: "QUARTERLY", interval: 1 }).toFixed(0)).toBe("100000");
    expect(monthlyEquivalent("100", { frequency: "WEEKLY", interval: 1 }).toFixed(2)).toBe("434.81");
  });
});
