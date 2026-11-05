import { ArrowLeftRight, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/shared/icon";
import { Money } from "@/components/shared/money";
import { formatDisplayDate } from "@/lib/dates";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/schemas";
import type { TransactionRow } from "./types";

export function TransactionTypeIcon({ row }: { row: TransactionRow }) {
  if (row.type === "TRANSFER")
    return (
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <ArrowLeftRight className="size-4" aria-hidden />
      </span>
    );
  if (row.isAdjustment)
    return (
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Scale className="size-4" aria-hidden />
      </span>
    );
  return <IconBadge name={row.category?.icon ?? "tag"} color={row.category?.color ?? "#94a3b8"} />;
}

export function TransactionAmount({ row, locale }: { row: TransactionRow; locale: string }) {
  if (row.type === "TRANSFER") return <Money value={row.amount} currency={row.currency} locale={locale} className="text-muted-foreground" />;
  return <Money value={row.amount} currency={row.currency} locale={locale} tone={row.type === "INCOME" ? "income" : "expense"} sign className="font-medium" />;
}

export function categoryLabel(row: TransactionRow) {
  if (row.type === "TRANSFER") return `${row.account.name} → ${row.destinationAccount?.name ?? "?"}`;
  if (row.isAdjustment) return "Balance adjustment";
  if (!row.category) return "Uncategorised";
  return row.category.parentName ? `${row.category.parentName} · ${row.category.name}` : row.category.name;
}

/** Compact list used on the overview and account pages. */
export function TransactionList({ rows, locale }: { rows: TransactionRow[]; locale: string }) {
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 py-2.5">
          <TransactionTypeIcon row={row} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.description}</p>
            <p className="truncate text-xs text-muted-foreground">
              {categoryLabel(row)} · {formatDisplayDate(row.date, false)}
              {row.type !== "TRANSFER" && <> · {row.account.name}</>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <TransactionAmount row={row} locale={locale} />
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
              {TRANSACTION_TYPE_LABELS[row.type]}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
