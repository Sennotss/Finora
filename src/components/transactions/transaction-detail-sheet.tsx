"use client";

import { useState } from "react";
import { ExternalLink, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Money } from "@/components/shared/money";
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from "@/features/transactions/schemas";
import { formatDisplayDate } from "@/lib/dates";
import { categoryLabel } from "./transaction-list";
import type { TransactionRow } from "./types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function TransactionDetailSheet({ row, locale, onClose, onEdit, onDelete }: { row: TransactionRow | null; locale: string; onClose: () => void; onEdit: (r: TransactionRow) => void; onDelete: (r: TransactionRow) => void }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function removeReceipt(id: string) {
    setRemoving(true);
    const res = await fetch(`/api/transactions/${id}/receipt`, { method: "DELETE" });
    setRemoving(false);
    if (res.ok) {
      toast.success("Receipt removed");
      onClose();
      router.refresh();
    } else toast.error("Could not remove the receipt");
  }

  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.description}</SheetTitle>
              <SheetDescription>
                <Badge variant="outline" className="font-normal">{row.isAdjustment ? "Balance adjustment" : TRANSACTION_TYPE_LABELS[row.type]}</Badge>
                {row.deleted && <Badge variant="destructive" className="ml-1.5">Deleted</Badge>}
              </SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <p className="text-2xl font-semibold tracking-tight">
                <Money value={row.amount} currency={row.currency} locale={locale} tone={row.type === "INCOME" ? "income" : row.type === "EXPENSE" ? "expense" : "neutral"} sign={row.type !== "TRANSFER"} />
              </p>
              {row.destinationAmount && (
                <p className="text-sm text-muted-foreground">
                  Received <Money value={row.destinationAmount} currency={row.destinationAccount?.currency ?? row.currency} locale={locale} />
                </p>
              )}
              <dl className="mt-4 divide-y">
                <Row label="Date">{formatDisplayDate(row.date)}</Row>
                <Row label={row.type === "TRANSFER" ? "From" : "Account"}>{row.account.name}</Row>
                {row.destinationAccount && <Row label="To">{row.destinationAccount.name}</Row>}
                {row.type !== "TRANSFER" && <Row label="Category">{categoryLabel(row)}</Row>}
                {row.merchant && <Row label="Merchant">{row.merchant}</Row>}
                {row.paymentMethod && <Row label="Payment method">{PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]}</Row>}
                {row.tags.length > 0 && <Row label="Tags">{row.tags.map((t) => `#${t}`).join(" ")}</Row>}
                {row.notes && <Row label="Notes"><span className="whitespace-pre-wrap">{row.notes}</span></Row>}
                {row.source && <Row label="Source">{row.source.kind === "bill" ? `Bill payment · ${row.source.label}` : `Recurring · ${row.source.label}`}</Row>}
                <Row label="Receipt">
                  {row.receipt ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <a href={`/api/transactions/${row.id}/receipt`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                        <Paperclip className="size-3.5" aria-hidden /> {row.receipt.fileName} <ExternalLink className="size-3" aria-hidden />
                      </a>
                      {!row.deleted && (
                        <Button size="xs" variant="ghost" onClick={() => removeReceipt(row.id)} disabled={removing}>
                          Remove
                        </Button>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </Row>
                <Row label="Created">{new Date(row.createdAt).toLocaleString()}</Row>
                <Row label="Last updated">{new Date(row.updatedAt).toLocaleString()}</Row>
              </dl>
            </div>
            {!row.deleted && (
              <SheetFooter className="flex-row justify-end">
                <Button variant="destructive" onClick={() => onDelete(row)}><Trash2 /> Delete</Button>
                <Button onClick={() => onEdit(row)}><Pencil /> Edit</Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
