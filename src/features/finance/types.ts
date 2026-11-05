import type Decimal from "decimal.js";

export type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

export type AccountTypeValue = "CASH" | "BANK" | "E_WALLET" | "SAVINGS" | "INVESTMENT" | "CREDIT_CARD" | "LOAN" | "OTHER";

export const LIABILITY_ACCOUNT_TYPES: readonly AccountTypeValue[] = ["CREDIT_CARD", "LOAN"];
export const LIQUID_ACCOUNT_TYPES: readonly AccountTypeValue[] = ["CASH", "BANK", "E_WALLET", "SAVINGS"];

export function isLiabilityAccount(type: AccountTypeValue): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type);
}

export function isLiquidAccount(type: AccountTypeValue): boolean {
  return LIQUID_ACCOUNT_TYPES.includes(type);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountTypeValue, string> = {
  CASH: "Cash",
  BANK: "Bank account",
  E_WALLET: "E-wallet",
  SAVINGS: "Savings account",
  INVESTMENT: "Investment account",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  OTHER: "Other",
};

/** Minimal transaction shape used by every calculation. Amounts are always positive. */
export type LedgerTx = {
  id: string;
  type: TxType;
  amount: Decimal;
  destinationAmount: Decimal | null;
  currency: string;
  date: Date;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  description: string;
  /** Reconciliation adjustments move balances but are not income or spending. */
  isAdjustment: boolean;
  /** Generated from a recurring template or settled a bill. */
  isScheduled: boolean;
};

export type LedgerAccount = {
  id: string;
  name: string;
  type: AccountTypeValue;
  currency: string;
  openingBalance: Decimal;
  openingDate: Date;
  status: "ACTIVE" | "ARCHIVED";
  color: string;
  icon: string;
  institution: string | null;
  creditLimit: Decimal | null;
};

export type LedgerCategory = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId: string | null;
  color: string;
  icon: string;
};

/** Net balance change of one account in one calendar month (in the account's currency). */
export type AccountMonthlyDelta = {
  accountId: string;
  /** First day of the month. */
  month: Date;
  delta: Decimal;
};
