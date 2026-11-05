import { describe, expect, it } from "vitest";
import { guessMapping, parseAmountValue, parseDateValue, validateRows } from "@/features/import/parse";

describe("import parsing", () => {
  it("guesses column mappings from common headers (English and Indonesian)", () => {
    expect(guessMapping(["Tanggal", "Keterangan", "Jumlah", "Kategori"])).toEqual({ date: 0, description: 1, amount: 2, category: 3 });
  });

  it("parses dates in the selected format and rejects impossible ones", () => {
    expect(parseDateValue("05/10/2026", "DD/MM/YYYY")).toBe("2026-10-05");
    expect(parseDateValue("10/05/2026", "MM/DD/YYYY")).toBe("2026-10-05");
    expect(parseDateValue("2026-10-05T00:00:00Z", "DD/MM/YYYY")).toBe("2026-10-05");
    expect(parseDateValue("31/02/2026", "DD/MM/YYYY")).toBeNull();
  });

  it("parses amounts with currency symbols, separators and accounting negatives", () => {
    expect(parseAmountValue("Rp 1.500.000", ",")).toBe("1500000");
    expect(parseAmountValue("-25,000.50", ".")).toBe("-25000.5");
    expect(parseAmountValue("(1,200)", ".")).toBe("-1200");
    expect(parseAmountValue("abc", ".")).toBeNull();
  });

  it("infers type from sign, resolves names and flags in-file duplicates", () => {
    const accounts = [{ id: "a1", name: "BCA", currency: "IDR", status: "ACTIVE" as const }];
    const categories = [{ id: "c1", name: "Groceries", kind: "EXPENSE" as const, parentId: null }];
    const rows = validateRows(
      [
        ["2026-10-01", "Superindo", "-100000", "bca", "groceries"],
        ["2026-10-01", "Superindo", "-100000", "BCA", "Groceries"],
        ["2026-10-02", "Refund", "50000", "BCA", ""],
      ],
      { date: 0, description: 1, amount: 2, account: 3, category: 4 },
      { dateFormat: "YYYY-MM-DD", decimalSeparator: ".", defaultAccountId: null, unknownCategory: "error" },
      accounts,
      categories,
      new Set(),
    );
    expect(rows.map((r) => r.status)).toEqual(["valid", "duplicate", "valid"]);
    expect(rows[0].input).toMatchObject({ type: "EXPENSE", amount: "100000", accountId: "a1", categoryId: "c1" });
    expect(rows[2].input?.type).toBe("INCOME");
  });
});
