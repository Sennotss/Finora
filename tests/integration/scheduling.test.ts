import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, addMonths, formatDateOnly, todayInTimeZone } from "@/lib/dates";
import { createBill, payBill, undoLastPayment } from "@/features/bills/service";
import { addContribution, createGoal } from "@/features/goals/service";
import { createRecurring, generateDueRecurring, generateRecurringForTemplate } from "@/features/recurring/service";
import { runUserMaintenance } from "@/features/maintenance/service";
import { categoryId, makeAccount, makeUser } from "./helpers";

const today = todayInTimeZone("UTC");

describe("recurring transactions", () => {
  it("generates each occurrence exactly once, even when runs overlap", async () => {
    const user = await makeUser();
    const bank = await makeAccount(user.id);
    const start = addMonths(today, -3);
    const template = await createRecurring(user.id, { description: "Salary", type: "INCOME", amount: "1000", accountId: bank.id, categoryId: await categoryId(user.id, "Salary"), frequency: "MONTHLY", interval: 1, startDate: formatDateOnly(start) });

    const results = await Promise.allSettled([generateRecurringForTemplate(user.id, template.id), generateDueRecurring(user.id, today), generateDueRecurring(user.id, today)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    await generateDueRecurring(user.id, today);

    const count = await db.transaction.count({ where: { recurringTransactionId: template.id } });
    expect(count).toBe(4); // start, +1, +2, +3 months (= today)
    const next = await db.recurringTransaction.findUniqueOrThrow({ where: { id: template.id } });
    expect(next.nextRunDate.getTime()).toBeGreaterThan(today.getTime());
  });
});

describe("bills", () => {
  it("advances the due date on payment and rejects paying the same cycle twice", async () => {
    const user = await makeUser();
    const bank = await makeAccount(user.id);
    const due = addDays(today, -2);
    const bill = await createBill(user.id, { name: "Internet", amount: "385000", currency: "IDR", accountId: bank.id, frequency: "MONTHLY", interval: 1, nextDueDate: formatDateOnly(due) });

    const payment = { dueDate: formatDateOnly(due), paidDate: formatDateOnly(today), amount: "385000", recordTransaction: true };
    const results = await Promise.allSettled([payBill(user.id, bill.id, payment), payBill(user.id, bill.id, payment)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toBeDefined();
    expect(await db.billPayment.count({ where: { billId: bill.id } })).toBe(1);
    expect(await db.transaction.count({ where: { userId: user.id, type: "EXPENSE" } })).toBe(1);

    const updated = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(formatDateOnly(updated.nextDueDate)).toBe(formatDateOnly(addMonths(due, 1)));

    await undoLastPayment(user.id, bill.id);
    const reverted = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(formatDateOnly(reverted.nextDueDate)).toBe(formatDateOnly(due));
    expect(await db.transaction.count({ where: { userId: user.id, deletedAt: null } })).toBe(0);
  });
});

describe("goals", () => {
  it("never lets withdrawals exceed the saved amount", async () => {
    const user = await makeUser();
    const goal = await createGoal(user.id, { name: "Laptop", targetAmount: "1000", initialAmount: "300" });
    await expect(addContribution(user.id, goal.id, { type: "WITHDRAWAL", amount: "301", date: formatDateOnly(today) })).rejects.toThrow(/can't withdraw/);
    await addContribution(user.id, goal.id, { type: "WITHDRAWAL", amount: "300", date: formatDateOnly(today) });
  });
});

describe("maintenance", () => {
  it("creates reminders once and is throttled", async () => {
    const user = await makeUser();
    await makeAccount(user.id);
    await createBill(user.id, { name: "Rent", amount: "1", currency: "IDR", frequency: "MONTHLY", interval: 1, nextDueDate: formatDateOnly(addDays(today, -1)) });
    const first = await runUserMaintenance(user.id);
    expect(first.skipped).toBe(false);
    expect((await runUserMaintenance(user.id)).skipped).toBe(true);
    await runUserMaintenance(user.id, { force: true });
    expect(await db.notification.count({ where: { userId: user.id, type: "BILL_OVERDUE" } })).toBe(1);
    expect(await db.financialSnapshot.count({ where: { userId: user.id } })).toBe(1);
  });
});
