import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountActions } from "@/components/accounts/account-actions";
import { EditAccountDialog, ReconcileDialog, TransferButton } from "@/components/accounts/account-dialogs";
import { ChartCard } from "@/components/charts/chart-card";
import { NetWorthChart } from "@/components/charts/charts";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { EmptyState } from "@/components/shared/empty-state";
import { IconBadge } from "@/components/shared/icon";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Money } from "@/components/shared/money";
import { QuickAddButton } from "@/components/transactions/quick-add-dialog";
import { TransactionList } from "@/components/transactions/transaction-list";
import { requireUserContext } from "@/lib/dal";
import { db } from "@/lib/db";
import { eachMonthStart, formatDateOnly, formatDisplayDate, formatMonth, lastNMonths } from "@/lib/dates";
import { D, formatMoney } from "@/lib/money";
import { balancesFromDeltas, cashFlowTotals, filterRange } from "@/features/analytics/calculations";
import { loadLedger, loadPosition } from "@/features/finance/repository";
import { ACCOUNT_TYPE_LABELS, isLiabilityAccount } from "@/features/finance/types";
import { listTransactions, parseFilters } from "@/features/transactions/service";
import { toTransactionRow } from "@/features/transactions/serialize";
import { n } from "@/features/analytics/service";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AccountDetail params={params} />
    </Suspense>
  );
}

async function AccountDetail({ params }: { params: PageProps<"/accounts/[id]">["params"] }) {
  const { id } = await params;
  const { user, ctx } = await requireUserContext();
  const { accounts, deltas, balances } = await loadPosition(user.id);
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();

  const balance = balances.get(id) ?? D(0);
  const liability = isLiabilityAccount(account.type);
  const months = eachMonthStart(lastNMonths(ctx.today, 12));
  const history = months.map((m) => {
    const b = balancesFromDeltas([account], deltas, m).get(id) ?? D(0);
    return { label: formatMonth(m), netWorth: n(b), assets: n(b), liabilities: 0 };
  });
  const range = lastNMonths(ctx.today, 1);
  const monthTxs = filterRange((await loadLedger(user.id, range)).filter((t) => t.accountId === id), range);
  const monthTotals = cashFlowTotals(monthTxs, { baseCurrency: account.currency, rateFor: () => D(1), toBase: (a) => D(a) });
  const [recent, txCount] = await Promise.all([
    listTransactions(user.id, parseFilters({ account: id, pageSize: "15" })),
    db.transaction.count({ where: { userId: user.id, OR: [{ accountId: id }, { destinationAccountId: id }] } }),
  ]);
  const today = formatDateOnly(ctx.today);
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, account.currency, { locale: ctx.locale });

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/accounts"><ChevronLeft /> Accounts</Link>
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <IconBadge name={account.icon} color={account.color} size="lg" />
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {account.name}
              {account.status === "ARCHIVED" && <Badge variant="secondary">Archived</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
              {account.institution && ` · ${account.institution}`} · opened {formatDisplayDate(account.openingDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {account.status === "ACTIVE" && (
            <>
              <TransferButton fromAccountId={account.id} />
              <ReconcileDialog accountId={account.id} currency={account.currency} recorded={balance.toFixed()} today={today} liability={liability} />
            </>
          )}
          <EditAccountDialog
            accountId={account.id}
            today={today}
            hasTransactions={txCount > 0}
            initial={{
              name: account.name,
              type: account.type,
              currency: account.currency,
              openingBalance: account.openingBalance.toFixed(),
              openingDate: formatDateOnly(account.openingDate),
              institution: account.institution ?? "",
              color: account.color,
              icon: account.icon as never,
              creditLimit: account.creditLimit?.toFixed() ?? "",
            }}
            trigger={<Button variant="outline"><Pencil /> Edit</Button>}
          />
          <AccountActions accountId={account.id} archived={account.status === "ARCHIVED"} canDelete={txCount === 0} name={account.name} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialSummaryCard label={liability ? "Amount owed" : "Current balance"} value={money(liability && balance.isNegative() ? balance.negated() : balance)} emphasis />
        {liability && account.creditLimit ? (
          <FinancialSummaryCard label="Available credit" value={money(D(account.creditLimit).plus(balance.isNegative() ? balance : 0))} />
        ) : (
          <FinancialSummaryCard label="Opening balance" value={money(account.openingBalance)} />
        )}
        <FinancialSummaryCard label="Money in this month" value={<Money value={monthTotals.income} currency={account.currency} locale={ctx.locale} />} hint="Income recorded to this account this month (transfers excluded)." />
        <FinancialSummaryCard label="Money out this month" value={<Money value={monthTotals.expense} currency={account.currency} locale={ctx.locale} />} hint="Expenses charged to this account this month (transfers excluded)." />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard className="lg:col-span-2" title="Balance history" description="Month-end balance, last 12 months" table={{ columns: ["Month", "Balance"], rows: history.map((h) => [h.label, money(h.netWorth)]) }}>
          <NetWorthChart data={history} height={220} />
        </ChartCard>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
            <CardDescription>{recent.total} transaction{recent.total === 1 ? "" : "s"} including transfers</CardDescription>
            <CardAction className="flex gap-1">
              {account.status === "ACTIVE" && <QuickAddButton variant="outline" label="Add" defaults={{ accountId: account.id }} />}
              <Button variant="ghost" size="sm" asChild><Link href={`/transactions?account=${account.id}`}>View all</Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recent.items.length === 0 ? <EmptyState compact title="No transactions for this account yet" /> : <TransactionList rows={recent.items.map(toTransactionRow)} locale={ctx.locale} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
