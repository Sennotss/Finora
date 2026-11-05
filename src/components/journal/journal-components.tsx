"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ellipsis, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { useFormat } from "@/components/shared/format-context";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import { createJournalEntryAction, deleteJournalEntryAction, saveMonthlyReviewAction, updateJournalEntryAction } from "@/features/journal/actions";
import { JOURNAL_TYPES, JOURNAL_TYPE_LABELS, journalEntrySchema, type JournalEntryInput, type MonthlyReviewInput } from "@/features/journal/schemas";

const MOODS = ["", "😟 Rough", "😕 Meh", "😐 Okay", "🙂 Good", "😄 Great"];

function EntryForm({ entryId, initial, today, onDone }: { entryId?: string; initial?: Partial<JournalEntryInput>; today: string; onDone: () => void }) {
  const f = useFormat();
  const { pending, run } = useServerAction();
  const form = useForm<JournalEntryInput>({ resolver: zodResolver(journalEntrySchema) as never, defaultValues: { type: "REFLECTION", title: "", content: "", entryDate: today, mood: null, amount: "", ...initial } });
  const type = form.watch("type");
  const e = form.formState.errors;
  const submit = form.handleSubmit(async () => {
    const values = form.getValues();
    await run<unknown>(() => (entryId ? updateJournalEntryAction(entryId, values) : createJournalEntryAction(values)), { onSuccess: onDone, onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="j-type" label="Type">
          <Controller control={form.control} name="type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="j-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{JOURNAL_TYPES.map((t) => <SelectItem key={t} value={t}>{JOURNAL_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </FormField>
        <FormField id="j-date" label="Date" error={e.entryDate?.message}>
          <Input id="j-date" type="date" {...form.register("entryDate")} />
        </FormField>
      </div>
      <FormField id="j-title" label="Title" error={e.title?.message} required>
        <Input id="j-title" maxLength={120} {...form.register("title")} placeholder={type === "DECISION" ? "e.g. Switched to a cheaper phone plan" : "Give it a short title"} />
      </FormField>
      <FormField id="j-content" label="Entry" error={e.content?.message} required>
        <Textarea id="j-content" rows={6} maxLength={10000} {...form.register("content")} placeholder={type === "LESSON" ? "What happened, and what will you do differently?" : "Write freely…"} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "UNEXPECTED_EXPENSE" && (
          <FormField id="j-amount" label="Amount" error={e.amount?.message}>
            <Controller control={form.control} name="amount" render={({ field }) => <MoneyInput id="j-amount" value={field.value ?? ""} onChange={field.onChange} currency={f.currency} locale={f.locale} />} />
          </FormField>
        )}
        <FormField id="j-mood" label="How do you feel about it?">
          <Controller control={form.control} name="mood" render={({ field }) => (
            <Select value={field.value ? String(field.value) : "0"} onValueChange={(v) => field.onChange(v === "0" ? null : Number(v))}>
              <SelectTrigger id="j-mood" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Not set</SelectItem>
                {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{MOODS[n]}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </FormField>
      </div>
      <FormRootError message={e.root?.message} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{entryId ? "Save changes" : "Save entry"}</Button>
      </div>
    </form>
  );
}

export function NewEntryButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New entry</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>New journal entry</DialogTitle><DialogDescription>Record a decision, a lesson or anything on your mind about money.</DialogDescription></DialogHeader>
          {open && <EntryForm today={today} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EntryMenu({ entryId, title, editable, initial, today }: { entryId: string; title: string; editable: boolean; initial: Partial<JournalEntryInput>; today: string }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}><Ellipsis /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editable && <DropdownMenuItem onSelect={() => setMode("edit")}><Pencil /> Edit</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onSelect={() => setMode("delete")}><Trash2 /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit entry</DialogTitle><DialogDescription>{title}</DialogDescription></DialogHeader>
          {mode === "edit" && <EntryForm entryId={entryId} initial={initial} today={today} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog open={mode === "delete"} onOpenChange={(o) => !o && setMode(null)} title="Delete this entry?" description={`"${title}" will be removed.`} confirmLabel="Delete" destructive onConfirm={() => deleteJournalEntryAction(entryId)} />
    </>
  );
}

export function ReviewMonthPicker({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select value={value} onValueChange={(v) => { const next = new URLSearchParams(params.toString()); next.set("month", v); router.push(`${pathname}?${next.toString()}`, { scroll: false }); }}>
      <SelectTrigger className="w-44" aria-label="Review month"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

const PROMPTS: { key: "wentWell" | "toImprove" | "nextPriorities"; label: string }[] = [
  { key: "wentWell", label: "What went well this month?" },
  { key: "toImprove", label: "What could be improved?" },
  { key: "nextPriorities", label: "What are my financial priorities next month?" },
];

export function MonthlyReviewForm({ initial }: { initial: MonthlyReviewInput }) {
  const { pending, run } = useServerAction();
  const form = useForm<MonthlyReviewInput>({ defaultValues: initial, values: initial });
  const submit = form.handleSubmit(async (values) => {
    await run(() => saveMonthlyReviewAction(values), { onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {PROMPTS.map((p) => (
        <FormField key={p.key} id={`rv-${p.key}`} label={p.label} error={form.formState.errors[p.key]?.message}>
          <Textarea id={`rv-${p.key}`} rows={3} maxLength={5000} {...form.register(p.key)} />
        </FormField>
      ))}
      <FormField id="rv-content" label="Other notes">
        <Textarea id="rv-content" rows={2} maxLength={10000} {...form.register("content")} />
      </FormField>
      <div className="flex items-center justify-between gap-3">
        <Controller control={form.control} name="mood" render={({ field }) => (
          <Select value={field.value ? String(field.value) : "0"} onValueChange={(v) => field.onChange(v === "0" ? null : Number(v))}>
            <SelectTrigger className="w-40" aria-label="How was the month"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Mood: not set</SelectItem>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{MOODS[n]}</SelectItem>)}
            </SelectContent>
          </Select>
        )} />
        <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}Save review</Button>
      </div>
    </form>
  );
}

export { MOODS };
