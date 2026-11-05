import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { identityConverter } from "@/lib/currency";
import { cashFlowTotals } from "@/features/analytics/calculations";
import { loadLedger, loadPosition } from "@/features/finance/repository";
import { reconcileAccount, deleteAccount } from "@/features/accounts/service";
import { bulkTransactions, createTransaction, deleteTransaction, restoreTransaction, updateTransaction } from "@/features/transactions/service";
import { parseDateOnly } from "@/lib/dates";
import { categoryId, makeAccount, makeUser } from "./helpers";

const range = { start: parseDateOnly("2026-01-01"), end: parseDateOnly("2026-12-31") };

describe("ledger integrity", () => {
  it("keeps balances, income and expenses consistent across transfers and credit cards", async () => {
    const user = await makeUser();
    const bank = await makeAccount(user.id, { openingBalance: "1000000" });
    const card = await makeAccount(user.id, { name: "Card", type: "CREDIT_CARD", creditLimit: "5000000" });
    const salary = await categoryId(user.id, "Salary");
    const food = await categoryId(user.id, "Restaurants");

    await createTransaction(user.id, { type: "INCOME", amount: "10000000", date: "2026-03-01", description: "Salary", accountId: bank.id, categoryId: salary });
    await createTransaction(user.id, { type: "EXPENSE", amount: "750000", date: "2026-03-05", description: "Dinner", accountId: card.id, categoryId: food, tags: ["family", "family"] });
    await createTransaction(user.id, { type: "TRANSFER", amount: "750000", date: "2026-03-20", description: "Card repayment", accountId: bank.id, destinationAccountId: card.id });

    const { balances, position } = await loadPosition(user.id);
    expect(balances.get(bank.id)!.toFixed()).toBe("10250000");
    expect(balances.get(card.id)!.toFixed()).toBe("0");
    expect(position.netWorth.toFixed()).toBe("10250000");

    const totals = cashFlowTotals(await loadLedger(user.id, range), identityConverter("IDR"));
    expect(totals.income.toFixed()).toBe("10000000");
    expect(totals.expense.toFixed()).toBe("750000"); // the repayment is not a second expense
    expect(await db.transactionTag.count()).toBe(1);
  });

  it("rejects references to another user's records", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const aliceBank = await makeAccount(alice.id);
    const bobBank = await makeAccount(bob.id);
    await expect(createTransaction(bob.id, { type: "EXPENSE", amount: "1", date: "2026-03-01", description: "x", accountId: aliceBank.id })).rejects.toThrow(/Account not found/);
    await expect(
      createTransaction(bob.id, { type: "EXPENSE", amount: "1", date: "2026-03-01", description: "x", accountId: bobBank.id, categoryId: await categoryId(alice.id, "Restaurants") }),
    ).rejects.toThrow(/Category not found/);
    const tx = await createTransaction(alice.id, { type: "EXPENSE", amount: "1", date: "2026-03-01", description: "x", accountId: aliceBank.id });
    await expect(deleteTransaction(bob.id, tx.id)).rejects.toThrow(/not found/);
    await expect(updateTransaction(bob.id, tx.id, { type: "EXPENSE", amount: "2", date: "2026-03-01", description: "y", accountId: bobBank.id })).rejects.toThrow(/not found/);
  });

  it("requires matching category kinds and a destination amount for cross-currency transfers", async () => {
    const user = await makeUser();
    const idr = await makeAccount(user.id);
    const usd = await makeAccount(user.id, { name: "USD", currency: "USD" });
    await expect(createTransaction(user.id, { type: "EXPENSE", amount: "1", date: "2026-03-01", description: "x", accountId: idr.id, categoryId: await categoryId(user.id, "Salary") })).rejects.toThrow(/expense category/);
    await expect(createTransaction(user.id, { type: "TRANSFER", amount: "160000", date: "2026-03-01", description: "fx", accountId: idr.id, destinationAccountId: usd.id })).rejects.toThrow(/USD/);
    await createTransaction(user.id, { type: "TRANSFER", amount: "160000", destinationAmount: "10", date: "2026-03-01", description: "fx", accountId: idr.id, destinationAccountId: usd.id });
    const { balances } = await loadPosition(user.id);
    expect(balances.get(usd.id)!.toFixed()).toBe("10");
  });

  it("excludes soft-deleted transactions everywhere and can restore them", async () => {
    const user = await makeUser();
    const bank = await makeAccount(user.id);
    const tx = await createTransaction(user.id, { type: "INCOME", amount: "500", date: "2026-03-01", description: "x", accountId: bank.id });
    await deleteTransaction(user.id, tx.id);
    expect((await loadPosition(user.id)).balances.get(bank.id)!.toFixed()).toBe("0");
    await restoreTransaction(user.id, tx.id);
    expect((await loadPosition(user.id)).balances.get(bank.id)!.toFixed()).toBe("500");
    expect(await bulkTransactions(user.id, { action: "delete", ids: [tx.id] })).toBe(1);
  });

  it("reconciles with an adjustment that moves the balance but not the cash-flow totals", async () => {
    const user = await makeUser();
    const bank = await makeAccount(user.id, { openingBalance: "1000" });
    const result = await reconcileAccount(user.id, bank.id, { actualBalance: "1250", date: "2026-03-31" });
    expect(result.difference).toBe("250");
    expect((await loadPosition(user.id)).balances.get(bank.id)!.toFixed()).toBe("1250");
    expect(cashFlowTotals(await loadLedger(user.id, range), identityConverter("IDR")).income.toFixed()).toBe("0");
  });

  it("refuses to hard-delete an account with history", async () => {
    const user = await makeUser();
    const bank = await makeAccount(user.id);
    await createTransaction(user.id, { type: "INCOME", amount: "1", date: "2026-03-01", description: "x", accountId: bank.id });
    await expect(deleteAccount(user.id, bank.id)).rejects.toThrow(/Archive it instead/);
  });
});
