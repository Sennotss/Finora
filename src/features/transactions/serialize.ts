import { formatDateOnly } from "@/lib/dates";
import { D } from "@/lib/money";
import type { TransactionRow } from "@/components/transactions/types";
import type { TransactionWithRelations } from "./service";

export function toTransactionRow(t: TransactionWithRelations): TransactionRow {
  return {
    id: t.id,
    type: t.type,
    amount: D(t.amount).toFixed(),
    destinationAmount: t.destinationAmount ? D(t.destinationAmount).toFixed() : null,
    currency: t.currency,
    date: formatDateOnly(t.date),
    description: t.description,
    merchant: t.merchant,
    notes: t.notes,
    paymentMethod: t.paymentMethod,
    isAdjustment: t.isAdjustment,
    deleted: t.deletedAt !== null,
    account: { id: t.account.id, name: t.account.name, color: t.account.color, currency: t.account.currency },
    destinationAccount: t.destinationAccount ? { id: t.destinationAccount.id, name: t.destinationAccount.name, color: t.destinationAccount.color, currency: t.destinationAccount.currency } : null,
    category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color, icon: t.category.icon, parentName: t.category.parent?.name ?? null } : null,
    tags: t.tags.map((x) => x.tag.name),
    receipt: t.receipt ? { fileName: t.receipt.fileName, size: t.receipt.size, mimeType: t.receipt.mimeType } : null,
    source: t.billPayment ? { kind: "bill", label: t.billPayment.bill.name } : t.recurringTransaction ? { kind: "recurring", label: t.recurringTransaction.description } : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
