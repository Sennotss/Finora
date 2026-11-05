"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPicker } from "@/components/shared/color-picker";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { AppIcon, ICON_NAMES, IconBadge } from "@/components/shared/icon";
import { useServerAction } from "@/components/shared/use-action";
import type { CategoryOption } from "@/components/transactions/types";
import { changePasswordAction, createCategoryAction, createTagAction, deleteCategoryAction, deleteExchangeRateAction, deleteTagAction, deleteUserAccountAction, saveExchangeRateAction, updateCategoryAction, updatePreferencesAction, updateProfileAction } from "@/features/settings/actions";
import { passwordChangeSchema, preferencesSchema, profileSchema } from "@/features/settings/schemas";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { z } from "zod";

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{children}</Button>;
}

export function ProfileForm({ initial }: { initial: z.input<typeof profileSchema> }) {
  const { pending, run } = useServerAction();
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: initial });
  const submit = form.handleSubmit(async (v) => { await run(() => updateProfileAction(v), { onError: (r) => applyFieldErrors(form, r.fieldErrors) }); });
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <FormField id="p-name" label="Name" error={form.formState.errors.name?.message}><Input id="p-name" autoComplete="name" {...form.register("name")} /></FormField>
      <FormField id="p-email" label="Email" error={form.formState.errors.email?.message}><Input id="p-email" type="email" autoComplete="email" {...form.register("email")} /></FormField>
      <div className="sm:col-span-2"><SubmitButton pending={pending}>Save profile</SubmitButton></div>
    </form>
  );
}

export function PasswordForm() {
  const { pending, run } = useServerAction();
  const form = useForm<z.input<typeof passwordChangeSchema>>({ resolver: zodResolver(passwordChangeSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => { await run(() => changePasswordAction(v), { onError: (r) => applyFieldErrors(form, r.fieldErrors) }); });
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
      <FormField id="pw-current" label="Current password" error={e.currentPassword?.message}><Input id="pw-current" type="password" autoComplete="current-password" {...form.register("currentPassword")} /></FormField>
      <FormField id="pw-new" label="New password" error={e.newPassword?.message}><Input id="pw-new" type="password" autoComplete="new-password" {...form.register("newPassword")} /></FormField>
      <FormField id="pw-confirm" label="Confirm new password" error={e.confirmPassword?.message}><Input id="pw-confirm" type="password" autoComplete="new-password" {...form.register("confirmPassword")} /></FormField>
      <div className="sm:col-span-3 flex items-center gap-3"><SubmitButton pending={pending}>Change password</SubmitButton><span className="text-xs text-muted-foreground">You&apos;ll be signed out of all sessions.</span></div>
    </form>
  );
}

const LOCALES = [["id-ID", "Indonesian (1.234.567,89)"], ["en-US", "English US (1,234,567.89)"], ["en-GB", "English UK"], ["de-DE", "German"], ["en-SG", "English Singapore"], ["ms-MY", "Malay"], ["ja-JP", "Japanese"]];
const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

export function PreferencesForm({ initial }: { initial: z.input<typeof preferencesSchema> }) {
  const { pending, run } = useServerAction();
  const form = useForm<z.input<typeof preferencesSchema>>({ resolver: zodResolver(preferencesSchema) as never, defaultValues: initial });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async () => { await run(() => updatePreferencesAction(form.getValues()), { onError: (r) => applyFieldErrors(form, r.fieldErrors) }); });
  const tz = [...new Set([initial.timezone, ...TIMEZONES])];
  const sel = (name: "baseCurrency" | "locale" | "timezone" | "weekStartsOn", options: [string, string][], id: string) => (
    <Controller control={form.control} name={name} render={({ field }) => (
      <Select value={String(field.value)} onValueChange={(v) => field.onChange(name === "weekStartsOn" ? Number(v) : v)}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    )} />
  );
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="pref-cur" label="Base currency" description="Reports and totals use this currency.">{sel("baseCurrency", SUPPORTED_CURRENCIES.map((c) => [c.code, `${c.code} — ${c.name}`]), "pref-cur")}</FormField>
        <FormField id="pref-locale" label="Number format" error={e.locale?.message}>{sel("locale", LOCALES as [string, string][], "pref-locale")}</FormField>
        <FormField id="pref-tz" label="Timezone" error={e.timezone?.message} description="Defines when your day starts.">{sel("timezone", tz.map((t) => [t, t]), "pref-tz")}</FormField>
        <FormField id="pref-week" label="Week starts on">{sel("weekStartsOn", [["1", "Monday"], ["0", "Sunday"], ["6", "Saturday"]], "pref-week")}</FormField>
      </div>
      <div>
        <p className="text-sm font-medium">Budget thresholds</p>
        <p className="text-xs text-muted-foreground">Usage at or above each level changes the budget status. 100% is always &quot;reached&quot; and above it &quot;exceeded&quot;.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <FormField id="th-normal" label="Normal from (%)" error={e.budgetNormalThreshold?.message}><Input id="th-normal" type="number" min={1} max={99} {...form.register("budgetNormalThreshold")} /></FormField>
          <FormField id="th-mod" label="Moderate from (%)" error={e.budgetModerateThreshold?.message}><Input id="th-mod" type="number" min={1} max={99} {...form.register("budgetModerateThreshold")} /></FormField>
          <FormField id="th-warn" label="Approaching limit from (%)" error={e.budgetWarningThreshold?.message}><Input id="th-warn" type="number" min={1} max={99} {...form.register("budgetWarningThreshold")} /></FormField>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="ef-months" label="Emergency fund target (months of expenses)" error={e.emergencyFundMonths?.message}><Input id="ef-months" type="number" min={1} max={24} {...form.register("emergencyFundMonths")} /></FormField>
        <FormField id="bill-days" label="Default bill reminder (days before due)" error={e.billReminderDays?.message}><Input id="bill-days" type="number" min={0} max={30} {...form.register("billReminderDays")} /></FormField>
      </div>
      <FormRootError message={e.root?.message} />
      <SubmitButton pending={pending}>Save preferences</SubmitButton>
    </form>
  );
}

type CatValues = { name: string; kind: "INCOME" | "EXPENSE"; parentId: string; color: string; icon: string };

function CategoryDialog({ open, onOpenChange, categories, initial, categoryId }: { open: boolean; onOpenChange: (o: boolean) => void; categories: CategoryOption[]; initial: CatValues; categoryId?: string }) {
  const { pending, run } = useServerAction();
  const form = useForm<CatValues>({ defaultValues: initial, values: initial });
  const kind = form.watch("kind");
  const submit = form.handleSubmit(async (v) => {
    await run(() => (categoryId ? updateCategoryAction(categoryId, v) : createCategoryAction(v)), { onSuccess: () => onOpenChange(false), onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  const parents = categories.filter((c) => c.kind === kind && !c.parentId && c.id !== categoryId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{categoryId ? "Edit category" : "New category"}</DialogTitle><DialogDescription>Categories can have one level of subcategories.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cat-name" label="Name" error={form.formState.errors.name?.message} required><Input id="cat-name" maxLength={50} {...form.register("name", { required: "Name is required" })} /></FormField>
            <FormField id="cat-kind" label="Kind">
              <Controller control={form.control} name="kind" render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => { field.onChange(v); form.setValue("parentId", "none"); }} disabled={Boolean(categoryId)}>
                  <SelectTrigger id="cat-kind" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="EXPENSE">Expense</SelectItem><SelectItem value="INCOME">Income</SelectItem></SelectContent>
                </Select>
              )} />
            </FormField>
          </div>
          <FormField id="cat-parent" label="Parent category" error={form.formState.errors.parentId?.message}>
            <Controller control={form.control} name="parentId" render={({ field }) => (
              <Select value={field.value || "none"} onValueChange={field.onChange}>
                <SelectTrigger id="cat-parent" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72"><SelectItem value="none">None (top level)</SelectItem>{parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FormField>
          <FormField id="cat-color" label="Colour"><Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} /></FormField>
          <FormField id="cat-icon" label="Icon">
            <Controller control={form.control} name="icon" render={({ field }) => (
              <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
                {ICON_NAMES.map((i) => (
                  <button key={i} type="button" role="radio" aria-checked={field.value === i} aria-label={i} onClick={() => field.onChange(i)} className={`flex size-8 items-center justify-center rounded-lg border ${field.value === i ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><AppIcon name={i} className="size-4" /></button>
                ))}
              </div>
            )} />
          </FormField>
          <FormRootError message={form.formState.errors.root?.message} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><SubmitButton pending={pending}>Save</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManager({ categories }: { categories: CategoryOption[] }) {
  const [editing, setEditing] = useState<{ id?: string; values: CatValues } | null>(null);
  const [deleting, setDeleting] = useState<CategoryOption | null>(null);
  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setEditing({ values: { name: "", kind: "EXPENSE", parentId: "none", color: "#2a78d6", icon: "tag" } })}><Plus /> New category</Button>
      <div className="grid gap-6 md:grid-cols-2">
        {(["EXPENSE", "INCOME"] as const).map((kind) => (
          <div key={kind}>
            <p className="mb-2 text-sm font-medium">{kind === "EXPENSE" ? "Expense categories" : "Income categories"}</p>
            <ul className="divide-y rounded-lg border">
              {categories.filter((c) => c.kind === kind && !c.parentId).flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]).map((c) => (
                <li key={c.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm ${c.parentId ? "pl-10" : ""}`}>
                  {!c.parentId && <IconBadge name={c.icon} color={c.color} size="sm" />}
                  <span className="flex-1 truncate">{c.name}</span>
                  <Button size="icon-xs" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing({ id: c.id, values: { name: c.name, kind: c.kind, parentId: c.parentId ?? "none", color: c.color, icon: c.icon } })}><Pencil /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {editing && <CategoryDialog open onOpenChange={(o) => !o && setEditing(null)} categories={categories} initial={editing.values} categoryId={editing.id} />}
      <ConfirmationDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete ${deleting?.name}?`} description="Past transactions keep this label for history. Subcategories move up a level and budget lines for it are removed." confirmLabel="Delete" destructive onConfirm={() => deleting && deleteCategoryAction(deleting.id)} />
    </div>
  );
}

export function TagManager({ tags }: { tags: { id: string; name: string; count: number }[] }) {
  const { pending, run } = useServerAction();
  const [name, setName] = useState("");
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await run(() => createTagAction({ name }), { onSuccess: () => setName("") }); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" maxLength={30} className="max-w-60" aria-label="New tag name" />
        <Button type="submit" variant="outline" disabled={pending}><Plus /> Add</Button>
      </form>
      {tags.length === 0 ? <p className="text-sm text-muted-foreground">No tags yet. Tags are also created when you type them on a transaction.</p> : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm">
              #{t.name} <span className="text-xs text-muted-foreground">({t.count})</span>
              <ConfirmationDialog trigger={<Button size="icon-xs" variant="ghost" aria-label={`Delete tag ${t.name}`}><Trash2 /></Button>} title={`Delete #${t.name}?`} description="It will be removed from all transactions." confirmLabel="Delete" destructive onConfirm={() => deleteTagAction(t.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RateValues = { fromCurrency: string; toCurrency: string; rate: string; date: string };

export function ExchangeRates({ rates, baseCurrency, today }: { rates: { id: string; fromCurrency: string; toCurrency: string; rate: string; date: string }[]; baseCurrency: string; today: string }) {
  const { pending, run } = useServerAction();
  const form = useForm<RateValues>({ defaultValues: { fromCurrency: baseCurrency === "USD" ? "IDR" : "USD", toCurrency: baseCurrency, rate: "", date: today } });
  const submit = form.handleSubmit(async (v) => { await run(() => saveExchangeRateAction(v), { onSuccess: () => form.setValue("rate", ""), onError: (r) => applyFieldErrors(form, r.fieldErrors) }); });
  const cur = (name: "fromCurrency" | "toCurrency", id: string) => (
    <Controller control={form.control} name={name} render={({ field }) => (
      <Select value={field.value} onValueChange={field.onChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
      </Select>
    )} />
  );
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-5" noValidate>
        <FormField id="fx-from" label="1 unit of">{cur("fromCurrency", "fx-from")}</FormField>
        <FormField id="fx-rate" label="equals" error={form.formState.errors.rate?.message}><Input id="fx-rate" inputMode="decimal" placeholder="16250" {...form.register("rate")} /></FormField>
        <FormField id="fx-to" label="of" error={form.formState.errors.toCurrency?.message}>{cur("toCurrency", "fx-to")}</FormField>
        <FormField id="fx-date" label="Effective" error={form.formState.errors.date?.message}><Input id="fx-date" type="date" {...form.register("date")} /></FormField>
        <SubmitButton pending={pending}>Save rate</SubmitButton>
      </form>
      <p className="text-xs text-muted-foreground">Totals convert foreign balances to {baseCurrency} using the most recent rate. Use a decimal point for the rate.</p>
      {rates.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="tabular">1 {r.fromCurrency} = {r.rate} {r.toCurrency}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">from {r.date}<Button size="icon-xs" variant="ghost" aria-label="Delete rate" onClick={() => run(() => deleteExchangeRateAction(r.id))}><Trash2 /></Button></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const { pending, run } = useServerAction();
  const form = useForm<{ password: string; confirm: string }>({ defaultValues: { password: "", confirm: "" } });
  const submit = form.handleSubmit(async (v) => { await run(() => deleteUserAccountAction(v), { onError: (r) => applyFieldErrors(form, r.fieldErrors) }); });
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}><Trash2 /> Delete my account</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete your account permanently?</DialogTitle><DialogDescription>All accounts, transactions, budgets, goals and journal entries are erased. This cannot be undone — export your data first.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField id="del-pw" label="Password" error={form.formState.errors.password?.message}><Input id="del-pw" type="password" autoComplete="current-password" {...form.register("password")} /></FormField>
            <FormField id="del-confirm" label='Type "DELETE" to confirm' error={form.formState.errors.confirm?.message}><Input id="del-confirm" {...form.register("confirm")} /></FormField>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="destructive" disabled={pending}>Delete everything</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
