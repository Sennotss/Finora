"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, LoaderCircle, Paperclip, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import { createTransactionAction, suggestCategoryAction, updateTransactionAction } from "@/features/transactions/actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, transactionInputSchema, type TransactionInput } from "@/features/transactions/schemas";
import type { CategorySuggestion } from "@/features/insights/categorize";
import { cn } from "@/lib/utils";
import { groupCategories, type AccountOption, type CategoryOption } from "./types";

type FormValues = TransactionInput;

const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;

export function TransactionForm({
  accounts,
  categories,
  locale,
  today,
  initial,
  transactionId,
  hasReceipt = false,
  onDone,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  locale: string;
  today: string;
  initial?: Partial<TransactionInput>;
  transactionId?: string;
  hasReceipt?: boolean;
  onDone?: () => void;
}) {
  const { pending, run } = useServerAction();
  const router = useRouter();
  const [showMore, setShowMore] = useState(Boolean(initial?.notes || initial?.merchant || initial?.tags?.length));
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [tagText, setTagText] = useState((initial?.tags ?? []).join(", "));
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(transactionInputSchema) as never,
    defaultValues: {
      type: "EXPENSE",
      amount: "",
      destinationAmount: "",
      date: today,
      description: "",
      merchant: "",
      accountId: accounts[0]?.id ?? "",
      destinationAccountId: "",
      categoryId: "none",
      paymentMethod: "",
      tags: [],
      notes: "",
      ...initial,
    },
  });
  const { register, control, watch, setValue, formState } = form;
  const type = watch("type");
  const accountId = watch("accountId");
  const destinationAccountId = watch("destinationAccountId");
  const description = watch("description");
  const categoryId = watch("categoryId");

  const source = accounts.find((a) => a.id === accountId);
  const destination = accounts.find((a) => a.id === destinationAccountId);
  const crossCurrency = type === "TRANSFER" && source && destination && source.currency !== destination.currency;
  const grouped = useMemo(() => (type === "TRANSFER" ? [] : groupCategories(categories, type)), [categories, type]);

  // Debounced smart-category suggestion while the user types a description.
  useEffect(() => {
    if (type === "TRANSFER" || !description || description.trim().length < 3) {
      setSuggestion(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const s = await suggestCategoryAction(description, type);
        setSuggestion(s && s.categoryId !== form.getValues("categoryId") ? s : null);
      } catch {
        setSuggestion(null);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [description, type, form]);

  useEffect(() => {
    if (suggestion && suggestion.categoryId === categoryId) setSuggestion(null);
  }, [categoryId, suggestion]);

  function onTypeChange(next: string) {
    if (!next) return;
    setValue("type", next as TransactionInput["type"]);
    setValue("categoryId", "none");
    if (next !== "TRANSFER") setValue("destinationAccountId", "");
  }

  async function uploadReceipt(id: string) {
    if (!receipt) return;
    const body = new FormData();
    body.append("file", receipt);
    const res = await fetch(`/api/transactions/${id}/receipt`, { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(`Transaction saved, but the receipt failed to upload: ${data.error ?? res.statusText}`);
    }
    router.refresh();
  }

  const submit = form.handleSubmit(async () => {
    const values = { ...form.getValues(), tags: tagText.split(",").map((t) => t.trim()).filter(Boolean) };
    await run(() => (transactionId ? updateTransactionAction(transactionId, values) : createTransactionAction(values)), {
      onSuccess: async (id) => {
        await uploadReceipt(id);
        onDone?.();
      },
      onError: (r) => applyFieldErrors(form, r.fieldErrors),
    });
  });

  const err = (name: keyof FormValues) => formState.errors[name]?.message as string | undefined;

  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">Create an account first — every transaction belongs to an account.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ToggleGroup type="single" variant="outline" value={type} onValueChange={onTypeChange} className="w-full" aria-label="Transaction type">
        <ToggleGroupItem value="EXPENSE" className="flex-1">Expense</ToggleGroupItem>
        <ToggleGroupItem value="INCOME" className="flex-1">Income</ToggleGroupItem>
        <ToggleGroupItem value="TRANSFER" className="flex-1">Transfer</ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="tx-amount" label={crossCurrency ? `Amount sent (${source?.currency})` : "Amount"} error={err("amount")} required>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <MoneyInput
                id="tx-amount"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                currency={source?.currency ?? "IDR"}
                locale={locale}
                placeholder="0"
                aria-invalid={Boolean(err("amount"))}
                autoFocus={!transactionId}
              />
            )}
          />
        </FormField>
        <FormField id="tx-date" label="Date" error={err("date")} required>
          <Input id="tx-date" type="date" {...register("date")} aria-invalid={Boolean(err("date"))} />
        </FormField>
      </div>

      <FormField id="tx-description" label="Description" error={err("description")} required>
        <Input id="tx-description" placeholder={type === "INCOME" ? "e.g. October salary" : type === "TRANSFER" ? "e.g. Credit card repayment" : "e.g. Groceries at Superindo"} maxLength={200} {...register("description")} aria-invalid={Boolean(err("description"))} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="tx-account" label={type === "TRANSFER" ? "From account" : "Account"} error={err("accountId")} required>
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="tx-account" className="w-full" aria-invalid={Boolean(err("accountId"))}>
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                      {a.name} <span className="text-muted-foreground">· {a.currency}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        {type === "TRANSFER" ? (
          <FormField id="tx-destination" label="To account" error={err("destinationAccountId")} required>
            <Controller
              control={control}
              name="destinationAccountId"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger id="tx-destination" className="w-full" aria-invalid={Boolean(err("destinationAccountId"))}>
                    <SelectValue placeholder="Choose account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id !== accountId).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                        {a.name} <span className="text-muted-foreground">· {a.currency}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        ) : (
          <FormField id="tx-category" label="Category" error={err("categoryId")}>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                  <SelectTrigger id="tx-category" className="w-full">
                    <SelectValue placeholder="Uncategorised" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="none">Uncategorised</SelectItem>
                    {grouped.map(({ parent, children }) => (
                      <SelectGroup key={parent.id}>
                        <SelectLabel className="sr-only">{parent.name}</SelectLabel>
                        <SelectItem value={parent.id}>
                          <span className="size-2 rounded-full" style={{ backgroundColor: parent.color }} aria-hidden />
                          {parent.name}
                        </SelectItem>
                        {children.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="pl-7">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        )}
      </div>

      {suggestion && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm" role="status">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <span>
            Suggested: <strong className="font-medium">{suggestion.categoryName}</strong>
            <span className="ml-1 text-xs text-muted-foreground">({suggestion.confidence} confidence — {suggestion.reason})</span>
          </span>
          <div className="ml-auto flex gap-1">
            <Button type="button" size="xs" onClick={() => setValue("categoryId", suggestion.categoryId, { shouldDirty: true })}>
              Use
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setSuggestion(null)} aria-label="Dismiss suggestion">
              <X />
            </Button>
          </div>
        </div>
      )}

      {crossCurrency && (
        <FormField id="tx-dest-amount" label={`Amount received (${destination?.currency})`} error={err("destinationAmount")} required description="The two accounts use different currencies.">
          <Controller
            control={control}
            name="destinationAmount"
            render={({ field }) => <MoneyInput id="tx-dest-amount" value={field.value ?? ""} onChange={field.onChange} currency={destination!.currency} locale={locale} />}
          />
        </FormField>
      )}

      <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" aria-expanded={showMore}>
        <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
        More details
      </button>

      {showMore && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="tx-method" label="Payment method">
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <SelectTrigger id="tx-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField id="tx-merchant" label="Merchant" error={err("merchant")}>
              <Input id="tx-merchant" maxLength={120} {...register("merchant")} />
            </FormField>
          </div>
          <FormField id="tx-tags" label="Tags" description="Separate with commas, e.g. work, travel">
            <Input id="tx-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} />
          </FormField>
          <FormField id="tx-notes" label="Notes" error={err("notes")}>
            <Textarea id="tx-notes" rows={2} maxLength={1000} {...register("notes")} />
          </FormField>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Receipt</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="sr-only"
              aria-label="Attach receipt"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file && file.size > MAX_RECEIPT_BYTES) {
                  toast.error("Receipts must be 2 MB or smaller");
                  e.target.value = "";
                  return;
                }
                setReceipt(file);
              }}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip /> {receipt ? "Change file" : hasReceipt ? "Replace receipt" : "Attach file"}
              </Button>
              <span className="truncate text-xs text-muted-foreground">{receipt ? receipt.name : hasReceipt ? "A receipt is attached" : "PNG, JPG, WEBP or PDF up to 2 MB"}</span>
            </div>
          </div>
        </div>
      )}

      <FormRootError message={formState.errors.root?.message} />

      <div className="flex justify-end gap-2 pt-1">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          {transactionId ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}
