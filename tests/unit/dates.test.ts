import { describe, expect, it } from "vitest";
import { addMonths, endOfMonth, formatDateOnly, parseDateOnly, periodProgress, resolvePeriod, startOfWeek, todayInTimeZone } from "@/lib/dates";

const d = parseDateOnly;
const f = formatDateOnly;

describe("dates", () => {
  it("rejects invalid calendar dates", () => {
    expect(() => parseDateOnly("2026-02-30")).toThrow();
  });

  it("clamps month arithmetic to the end of shorter months", () => {
    expect(f(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(f(addMonths(d("2026-02-28"), 1, 31))).toBe("2026-03-31");
    expect(f(endOfMonth(d("2028-02-10")))).toBe("2028-02-29");
  });

  it("resolves 'today' in the user's timezone", () => {
    // 2026-10-29 20:00 UTC is already 30 Oct in Jakarta (UTC+7).
    const now = new Date("2026-10-29T20:00:00Z");
    expect(f(todayInTimeZone("Asia/Jakarta", now))).toBe("2026-10-30");
    expect(f(todayInTimeZone("America/New_York", now))).toBe("2026-10-29");
  });

  it("computes week starts for Monday and Sunday weeks", () => {
    expect(f(startOfWeek(d("2026-10-29"), 1))).toBe("2026-10-26");
    expect(f(startOfWeek(d("2026-10-29"), 0))).toBe("2026-10-25");
  });

  it("resolves period presets with inclusive boundaries and comparison periods", () => {
    const today = d("2026-10-29");
    const month = resolvePeriod("this_month", today);
    expect([f(month.range.start), f(month.range.end)]).toEqual(["2026-10-01", "2026-10-31"]);
    expect([f(month.previous.start), f(month.previous.end)]).toEqual(["2026-09-01", "2026-09-30"]);

    const last = resolvePeriod("last_month", d("2026-03-15"));
    expect([f(last.range.start), f(last.range.end)]).toEqual(["2026-02-01", "2026-02-28"]);

    const custom = resolvePeriod("custom", today, { from: "2026-10-10", to: "2026-10-01" });
    expect([f(custom.range.start), f(custom.range.end)]).toEqual(["2026-10-01", "2026-10-10"]);
    expect([f(custom.previous.start), f(custom.previous.end)]).toEqual(["2026-09-21", "2026-09-30"]);
  });

  it("reports elapsed days within a period", () => {
    const range = { start: d("2026-10-01"), end: d("2026-10-31") };
    expect(periodProgress(range, d("2026-10-10"))).toEqual({ elapsedDays: 10, totalDays: 31 });
    expect(periodProgress(range, d("2026-11-05")).elapsedDays).toBe(31);
    expect(periodProgress(range, d("2026-09-05")).elapsedDays).toBe(0);
  });
});
