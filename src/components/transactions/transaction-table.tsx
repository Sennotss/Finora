"use client";

import { useMemo, useState } from "react";
import { ArchiveRestore, Ellipsis, Eye, Paperclip, Pencil, Repeat, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useServerAction } from "@/components/shared/use-action";
import { bulkTransactionAction, deleteTransactionAction, restoreTransactionAction } from "@/features/transactions/actions";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/schemas";
import { formatDisplayDate } from "@/lib/dates";
import { TransactionDetailSheet } from "./transaction-detail-sheet";
import { TransactionForm } from "./transaction-form";
import { TransactionAmount, TransactionTypeIcon, categoryLabel } from "./transaction-list";
import { groupCategories, type AccountOption, type CategoryOption, type TransactionRow } from "./types";

export function rowToInput(row: TransactionRow) {
  return {
    type: row.type,
    amount: row.amount,
    destinationAmount: row.destinationAmount ?? "",
    date: row.date,
    description: row.description,
    merchant: row.merchant ?? "",
    accountId: row.account.id,
    destinationAccountId: row.destinationAccount?.id ?? "",
    categoryId: row.category?.id ?? "none",
    paymentMethod: (row.paymentMethod ?? "") as never,
    tags: row.tags,
    notes: row.notes ?? "",
  };
}

export function TransactionTable({
  rows,
  accounts,
  categories,
  locale,
  today,
  deletedView,
}: {
  rows: TransactionRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  locale: string;
  today: string;
  deletedView: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [viewing, setViewing] = useState<TransactionRow | null>(null);
  const [deleting, setDeleting] = useState<TransactionRow | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const { run, pending } = useServerAction();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedIds = useMemo(() => rows.filter((r) => selected.has(r.id)).map((r) => r.id), [rows, selected]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(row: TransactionRow) {
    const r = await deleteTransactionAction(row.id);
    if (r.ok) {
      toast.success("Transaction deleted", { action: { label: "Undo", onClick: () => void restoreTransactionAction(row.id) } });
      setViewing(null);
    } else toast.error(r.error);
  }

  async function bulk(action: "delete" | "restore" | "categorize", categoryId?: string) {
    const ids = selectedIds;
    await run(() => bulkTransactionAction(action === "categorize" ? { action, ids, categoryId } : { action, ids }), {
      silent: true,
      onSuccess: (count) => {
        const verb = action === "delete" ? "deleted" : action === "restore" ? "restored" : "recategorised";
        toast.success(`${count} transaction${count === 1 ? "" : "s"} ${verb}`, {
          ...(action === "delete" ? { action: { label: "Undo", onClick: () => void bulkTransactionAction({ action: "restore", ids }) } } : {}),
        });
        if (action === "categorize" && Number(count) < ids.length) toast.info("Transfers and transactions of the other type were left unchanged.");
        setSelected(new Set());
      },
    });
  }

  // Editable accounts include the row's own account even if archived.
  const editAccounts = (row: TransactionRow) => {
    const ids = new Set(accounts.map((a) => a.id));
    const extra = [row.account, row.destinationAccount].filter((a): a is NonNullable<typeof a> => Boolean(a) && !ids.has(a!.id));
    return [...accounts, ...extra.map((a) => ({ ...a, type: "OTHER", icon: "wallet" }))];
  };

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm" role="region" aria-label="Bulk actions">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {deletedView ? (
              <Button size="sm" variant="outline" onClick={() => bulk("restore")} disabled={pending}>
                <ArchiveRestore /> Restore
              </Button>
            ) : (
              <>
                <Select onValueChange={(v) => bulk("categorize", v)}>
                  <SelectTrigger size="sm" className="w-44" aria-label="Set category for selected">
                    <Tag className="size-3.5" />
                    <SelectValue placeholder="Set category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {(["EXPENSE", "INCOME"] as const).map((kind) => (
                      <SelectGroup key={kind}>
                        <SelectLabel>{kind === "EXPENSE" ? "Expense" : "Income"}</SelectLabel>
                        {groupCategories(categories, kind).flatMap(({ parent, children }) => [
                          <SelectItem key={parent.id} value={parent.id}>{parent.name}</SelectItem>,
                          ...children.map((c) => <SelectItem key={c.id} value={c.id} className="pl-7">{c.name}</SelectItem>),
                        ])}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="destructive" onClick={() => setBulkDelete(true)} disabled={pending}>
                  <Trash2 /> Delete
                </Button>
              </>
            )}
            <Button size="icon-sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        {/* Desktop table */}
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all on this page" />
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined} className="group">
                <TableCell>
                  <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label={`Select ${row.description}`} />
                </TableCell>
                <TableCell className="max-w-72">
                  <button type="button" className="flex min-w-0 items-center gap-2.5 text-left" onClick={() => setViewing(row)}>
                    <TransactionTypeIcon row={row} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:underline">{row.description}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {row.merchant && <span className="truncate">{row.merchant}</span>}
                        {row.source && <Repeat className="size-3" aria-label={row.source.kind === "bill" ? "Bill payment" : "Recurring"} />}
                        {row.receipt && <Paperclip className="size-3" aria-label="Has receipt" />}
                        {row.tags.slice(0, 2).map((t) => <span key={t}>#{t}</span>)}
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell className="max-w-44 truncate text-muted-foreground">{categoryLabel(row)}</TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDisplayDate(row.date)}</TableCell>
                <TableCell className="max-w-36 truncate">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.account.color }} aria-hidden />
                    {row.account.name}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">{row.isAdjustment ? "Adjustment" : TRANSACTION_TYPE_LABELS[row.type]}</Badge>
                </TableCell>
                <TableCell className="text-right"><TransactionAmount row={row} locale={locale} /></TableCell>
                <TableCell>
                  <RowMenu row={row} deletedView={deletedView} onView={() => setViewing(row)} onEdit={() => setEditing(row)} onDelete={() => setDeleting(row)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Mobile list */}
        <ul className="divide-y md:hidden">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
              <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label={`Select ${row.description}`} />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setViewing(row)}>
                <TransactionTypeIcon row={row} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.description}</span>
                  <span className="block truncate text-xs text-muted-foreground">{categoryLabel(row)} · {formatDisplayDate(row.date, false)}</span>
                </span>
                <TransactionAmount row={row} locale={locale} />
              </button>
              <RowMenu row={row} deletedView={deletedView} onView={() => setViewing(row)} onEdit={() => setEditing(row)} onDelete={() => setDeleting(row)} />
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
            <DialogDescription>Corrections update every report immediately.</DialogDescription>
          </DialogHeader>
          {editing && (
            <TransactionForm
              key={editing.id}
              accounts={editAccounts(editing)}
              categories={categories}
              locale={locale}
              today={today}
              initial={rowToInput(editing)}
              transactionId={editing.id}
              hasReceipt={editing.receipt !== null}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <TransactionDetailSheet row={viewing} locale={locale} onClose={() => setViewing(null)} onEdit={(r) => { setViewing(null); setEditing(r); }} onDelete={(r) => setDeleting(r)} />

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this transaction?"
        description={`"${deleting?.description}" will be removed from all balances and reports. You can restore it from Recently deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleting) await remove(deleting);
          setDeleting(null);
        }}
      />
      <ConfirmationDialog
        open={bulkDelete}
        onOpenChange={setBulkDelete}
        title={`Delete ${selectedIds.length} transactions?`}
        description="They will be removed from all balances and reports. You can restore them from Recently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => bulk("delete")}
      />
    </>
  );
}

function RowMenu({ row, deletedView, onView, onEdit, onDelete }: { row: TransactionRow; deletedView: boolean; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.description}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onView}><Eye /> View details</DropdownMenuItem>
        {deletedView ? (
          <DropdownMenuItem
            onSelect={async () => {
              const r = await restoreTransactionAction(row.id);
              if (r.ok) toast.success("Transaction restored");
              else toast.error(r.error);
            }}
          >
            <ArchiveRestore /> Restore
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> Delete</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
