import { parseDateOnly } from "@/lib/dates";
import { D } from "@/lib/money";
import type { LedgerAccount, LedgerTx } from "@/features/finance/types";

let seq = 0;

export function tx(partial: Partial<Omit<LedgerTx, "amount" | "date" | "destinationAmount">> & { amount: string | number; date: string; destinationAmount?: string | number | null }): LedgerTx {
  seq++;
  return {
    id: partial.id ?? `tx${seq}`,
    type: partial.type ?? "EXPENSE",
    amount: D(partial.amount),
    destinationAmount: partial.destinationAmount == null ? null : D(partial.destinationAmount),
    currency: partial.currency ?? "IDR",
    date: parseDateOnly(partial.date),
    accountId: partial.accountId ?? "bank",
    destinationAccountId: partial.destinationAccountId ?? null,
    categoryId: partial.categoryId ?? null,
    description: partial.description ?? "Test",
    isAdjustment: partial.isAdjustment ?? false,
    isScheduled: partial.isScheduled ?? false,
  };
}

export function account(partial: Partial<Omit<LedgerAccount, "openingBalance" | "openingDate">> & { id: string; openingBalance?: string | number; openingDate?: string }): LedgerAccount {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    type: partial.type ?? "BANK",
    currency: partial.currency ?? "IDR",
    openingBalance: D(partial.openingBalance ?? 0),
    openingDate: parseDateOnly(partial.openingDate ?? "2026-01-01"),
    status: partial.status ?? "ACTIVE",
    color: "#000",
    icon: "wallet",
    institution: null,
    creditLimit: null,
  };
}

export const d = parseDateOnly;
