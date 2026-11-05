import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, CalendarClock, Clock, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillMenu, NewBillButton, NewRecurringButton, PayBillButton, RecurringMenu } from "@/components/bills/bill-manager";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { EmptyState } from "@/components/shared/empty-state";
import { IconBadge } from "@/components/shared/icon";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserContext } from "@/lib/dal";
import { formatDateOnly, formatDisplayDate } from "@/lib/dates";
import { formatMoney, sum } from "@/lib/money";
import { describeRule } from "@/lib/recurrence";
import { listActiveAccounts } from "@/features/accounts/service";
import { billTotals, listBills, type BillItem } from "@/features/bills/service";
import { listCategories } from "@/features/categories/service";
import { listRecurring } from "@/features/recurring/service";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/schemas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bills & Subscriptions" };

export default function BillsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" />}>
      <Bills />
    </Suspense>
  );
}

function statusLabel(b: BillItem) {
  if (b.status === "inactive") return { text: "Inactive", cls: "text-muted-foreground", icon: Clock };
  if (b.status === "overdue") return { text: `Overdue by ${-b.daysUntilDue} day${b.daysUntilDue === -1 ? "" : "s"}`, cls: "text-negative", icon: AlertTriangle };
  if (b.daysUntilDue === 0) return { text: "Due today", cls: "text-warning", icon: CalendarClock };
  if (b.status === "due_soon") return { text: `Due in ${b.daysUntilDue} day${b.daysUntilDue === 1 ? "" : "s"}`, cls: "text-warning", icon: CalendarClock };
  return { text: `Due in ${b.daysUntilDue} days`, cls: "text-muted-foreground", icon: CalendarClock };
}

async function Bills() {
  const { user, ctx } = await requireUserContext();
  const [bills, recurring, accounts, categories] = await Promise.all([listBills(user.id), listRecurring(user.id), listActiveAccounts(user.id), listCategories(user.id)]);
  const totals = billTotals(bills);
  const today = formatDateOnly(ctx.today);
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, ctx.baseCurrency, { locale: ctx.locale });
  const shared = { accounts, categories, today };
  const recurringIncome = sum(recurring.filter((r) => r.isActive && r.type === "INCOME").map((r) => r.monthlyEquivalentBase));

  return (
    <div className="space-y-6">
      <PageHeader title="Bills & subscriptions" description="Recurring obligations, reminders and automatically posted recurring transactions." actions={<><NewRecurringButton {...shared} /><NewBillButton {...shared} /></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialSummaryCard label="Monthly recurring bills" value={money(totals.monthlyRecurring)} emphasis hint="Every active bill converted to a monthly amount (e.g. annual ÷ 12)." footer={totals.missingRates ? <span className="text-xs text-muted-foreground">Some bills lack an exchange rate</span> : undefined} />
        <FinancialSummaryCard label="Subscriptions per month" value={money(totals.subscriptionsMonthly)} />
        <FinancialSummaryCard label="Overdue" icon={AlertTriangle} value={totals.overdue.length} footer={<span className="text-xs text-muted-foreground">{totals.dueSoon.length} due soon</span>} />
        <FinancialSummaryCard label="Recurring income per month" value={money(recurringIncome)} />
      </div>

      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Bills ({bills.length})</TabsTrigger>
          <TabsTrigger value="recurring">Recurring transactions ({recurring.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="bills" className="mt-4">
          {bills.length === 0 ? (
            <Card><CardContent><EmptyState icon={CalendarClock} title="No bills yet" description="Add rent, utilities, internet, insurance, loan instalments or streaming subscriptions." /></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {bills.map((b) => {
                    const s = statusLabel(b);
                    return (
                      <li key={b.id} className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center", !b.isActive && "opacity-60")}>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <IconBadge name={b.category?.icon ?? (b.isSubscription ? "repeat" : "receipt")} color={b.category?.color ?? "#64748b"} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-medium">
                              {b.name}
                              {b.isSubscription && <Badge variant="secondary" className="font-normal">Subscription</Badge>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {describeRule({ frequency: b.frequency, interval: b.interval })} · next {formatDisplayDate(b.nextDueDate)}
                              {b.account && ` · from ${b.account.name}`}
                              {b.payments[0] && ` · last paid ${formatDisplayDate(b.payments[0].paidDate)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:justify-end">
                          <span className={cn("flex items-center gap-1 text-xs", s.cls)}><s.icon className="size-3.5" aria-hidden />{s.text}</span>
                          <Money value={b.amount} currency={b.currency} locale={ctx.locale} className="w-28 text-right font-medium" />
                          {b.isActive && <PayBillButton billId={b.id} name={b.name} amount={b.amount.toFixed()} currency={b.currency} accountId={b.accountId} dueDate={formatDisplayDate(b.nextDueDate)} dueDateIso={b.nextDueDate} accounts={accounts} today={today} />}
                          <BillMenu
                            {...shared}
                            billId={b.id}
                            name={b.name}
                            url={b.url}
                            hasPayments={b.payments.length > 0}
                            initial={{ name: b.name, amount: b.amount.toFixed(), currency: b.currency, accountId: b.accountId ?? "none", categoryId: b.categoryId ?? "none", frequency: b.frequency, interval: b.interval, nextDueDate: b.nextDueDate, endDate: b.endDate ?? "", isSubscription: b.isSubscription, reminderDays: b.reminderDays, isActive: b.isActive, url: b.url ?? "", notes: b.notes ?? "" }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="recurring" className="mt-4">
          {recurring.length === 0 ? (
            <Card><CardContent><EmptyState icon={Repeat} title="No recurring transactions" description="Set up your salary or a monthly transfer to savings and it will be recorded automatically on schedule." /></CardContent></Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Recurring transactions</CardTitle>
                <CardDescription>Each occurrence is posted exactly once — re-runs never create duplicates.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {recurring.map((r) => (
                    <li key={r.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", !r.isActive && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium">
                          {r.description}
                          <Badge variant="outline" className="font-normal">{TRANSACTION_TYPE_LABELS[r.type]}</Badge>
                          {!r.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.schedule} · {r.type === "TRANSFER" ? `${r.account.name} → ${r.destinationAccount?.name}` : r.account.name}
                          {r.category && ` · ${r.category.name}`} · {r.isActive ? `next ${formatDisplayDate(r.nextRunDate)}` : "stopped"} · {r.generatedCount} posted
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Money value={r.amount} currency={r.currency} locale={ctx.locale} tone={r.type === "INCOME" ? "income" : r.type === "EXPENSE" ? "expense" : "neutral"} sign={r.type !== "TRANSFER"} className="font-medium" />
                        <RecurringMenu
                          {...shared}
                          id={r.id}
                          name={r.description}
                          initial={{ description: r.description, type: r.type, amount: r.amount.toFixed(), accountId: r.accountId, destinationAccountId: r.destinationAccountId ?? "", categoryId: r.categoryId ?? "none", paymentMethod: (r.paymentMethod ?? "") as never, frequency: r.frequency, interval: r.interval, startDate: r.startDate, endDate: r.endDate ?? "", isActive: r.isActive, notes: r.notes ?? "" }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
