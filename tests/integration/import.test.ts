import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { commitImport, previewImport, undoImport } from "@/features/import/service";
import { makeAccount, makeUser } from "./helpers";

const options = { dateFormat: "DD/MM/YYYY" as const, decimalSeparator: "," as const, defaultAccountId: null, unknownCategory: "error" as const };
const mapping = { date: 0, description: 1, amount: 2, account: 3, category: 4 };

describe("transaction import", () => {
  it("previews, skips invalid rows and duplicates, and imports atomically", async () => {
    const user = await makeUser();
    await makeAccount(user.id, { name: "BCA" });
    const rows = [
      ["01/10/2026", "Groceries", "-350.000", "BCA", "Groceries"],
      ["01/10/2026", "Groceries", "-350.000", "BCA", "Groceries"], // duplicate of the row above
      ["02/10/2026", "Salary", "15.000.000", "BCA", "Salary"],
      ["31/02/2026", "Bad date", "-1", "BCA", ""],
      ["03/10/2026", "Unknown cat", "-1,5", "BCA", "Nope"],
      ["04/10/2026", "No account", "-10", "Mandiri", ""],
    ];
    const preview = await previewImport(user.id, { fileName: "t.csv", rows, mapping, options });
    expect(preview.summary).toEqual({ total: 6, valid: 2, duplicates: 1, invalid: 3 });

    const report = await commitImport(user.id, { fileName: "t.csv", rows, mapping, options });
    expect(report.imported).toBe(2);
    expect(report.skippedInvalid.map((r) => r.rowNumber)).toEqual([5, 6, 7]);
    expect(report.skippedDuplicates).toEqual([3]);

    const stored = await db.transaction.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
    expect(stored.map((t) => [t.type, t.amount.toString()])).toEqual([["EXPENSE", "350000"], ["INCOME", "15000000"]]);

    // Re-importing the same file finds only duplicates.
    const again = await previewImport(user.id, { fileName: "t.csv", rows, mapping, options });
    expect(again.summary.valid).toBe(0);

    expect(await undoImport(user.id, report.batchId)).toBe(2);
  });
});
