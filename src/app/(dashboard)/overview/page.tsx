import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Landmark, PiggyBank, Scale, TrendingDown, TrendingUp, Wallet, Waves, CreditCard, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { ChartCard } from "@/components/charts/chart-card";
import { BreakdownChart, CashFlowTrendChart, IncomeExpenseChart, NetWorthChart, SignedBarChart } from "@/components/charts/charts";
import { FinancialHealthScore } from "@/components/analytics/financial-health-score";
import { FinancialInsightCard } from "@/components/dashboard/financial-insight-card";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { GoalProgressSummary } from "@/components/goals/goal-progress-card";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { Delta } from "@/components/shared/delta";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { QuickAddButton } from "@/components/transactions/quick-add-dialog";
import { TransactionList } from "@/components/transactions/transaction-list";
import { requireUserContext } from "@/lib/dal";
import { formatDisplayDate, formatMonth } from "@/lib/dates";
import { formatMoney, formatPercent, percentChange } from "@/lib/money";
import { periodFromSearchParams } from "@/lib/period";
import { buildFinancialContext, n, serializeSeries } from "@/features/analytics/service";
import { upcomingBills } from "@/features/bills/service";
import { recentTransactions } from "@/features/transactions/service";
import { toTransactionRow } from "@/features/transactions/serialize";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage({ searchParams }: PageProps<"/overview">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/overview">["searchParams"] }) {
  const { user, ctx } = await requireUserContext();
  const period = periodFromSearchParams(await searchParams, ctx.today, ctx.weekStartsOn, "this_month");
  const [data, recent, bills] = await Promise.all([buildFinancialContext(user.id, period), recentTransactions(user.id, period.range, 8), upcomingBills(user.id, 14)]);
  const { position, current, previous } = data;
  const cur = ctx.baseCurrency;
  const loc = ctx.locale;
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, cur, { locale: loc });
  const compare = period.preset === "today" ? "vs yesterday" : `vs previous ${period.preset.includes("month") ? "period" : "period"}`;

  if (data.accounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Let's set up your finances." />
        <Card>
          <CardContent>
            <EmptyState
              icon={Wallet}
              title="Add your first account"
              description="Accounts hold your balances — a bank account, cash, an e-wallet or a credit card. Then record transactions to see your financial picture come together."
              action={
                <Button asChild>
                  <Link href="/accounts?new=1">Create an account</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const series = serializeSeries(data.cashFlow, data.granularity);
  const breakdown = data.expenseBreakdown.map((r) => ({ id: r.categoryId ?? "none", name: r.name, color: r.color, value: n(r.amount), share: r.share.toNumber() }));
  const monthlySavings = data.months.map((m) => ({ label: formatMonth(m.month), value: n(m.net) }));
  const netWorth = data.netWorth.map((p) => ({ label: formatMonth(p.month), netWorth: n(p.netWorth), assets: n(p.assets), liabilities: n(p.liabilities) }));
  const missing = [...new Set([...position.missingCurrencies, ...current.missingCurrencies])];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`${period.label} · ${formatDisplayDate(period.range.start)} – ${formatDisplayDate(period.range.end)}`}
        actions={
          <>
            <DateRangeFilter current={period.preset} label={period.label} from={period.from} to={period.to} />
            <QuickAddButton variant="outline" label="Quick add" />
          </>
        }
      />

      {missing.length > 0 && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Some amounts in {missing.join(", ")} are excluded from totals because no exchange rate to {cur} is set.{" "}
          <Link href="/settings#exchange-rates" className="font-medium underline underline-offset-4">Add a rate</Link>
        </p>
      )}

      <section aria-label="Financial position" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialSummaryCard label="Net worth" icon={Scale} emphasis value={money(position.netWorth)} hint="Total assets minus total liabilities, across all accounts." footer={<span className="text-xs text-muted-foreground">Assets {formatMoney(position.assets, cur, { locale: loc, compact: true })} · Liabilities {formatMoney(position.liabilities, cur, { locale: loc, compact: true })}</span>} />
        <FinancialSummaryCard label="Total balance" icon={Wallet} value={money(position.liquid)} hint="Cash, bank, e-wallet and savings balances (excludes investments and credit)." />
        <FinancialSummaryCard label="Total assets" icon={Landmark} value={money(position.assets)} hint="Sum of all positive account balances." />
        <FinancialSummaryCard label="Total liabilities" icon={CreditCard} value={money(position.liabilities)} hint="Amounts owed on credit cards, loans and overdrawn accounts." />
      </section>

      <section aria-label="Cash flow for the selected period" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialSummaryCard label="Income" icon={TrendingUp} value={money(current.income)} footer={<Delta value={percentChange(current.income, previous.income)} label={compare} />} />
        <FinancialSummaryCard label="Expenses" icon={TrendingDown} value={money(current.expense)} footer={<Delta value={percentChange(current.expense, previous.expense)} upIsGood={false} label={compare} />} />
        <FinancialSummaryCard label="Net cash flow" icon={Waves} value={<Money value={current.net} currency={cur} locale={loc} tone="auto" sign />} hint="Income minus expenses. Transfers between your accounts are excluded." footer={<span className="text-xs text-muted-foreground">Previous: {money(previous.net)}</span>} />
        <FinancialSummaryCard label="Saving rate" icon={Percent} value={formatPercent(current.savingRate, { locale: loc })} hint="(Income − Expenses) ÷ Income. Not shown when there is no income." footer={<span className="text-xs text-muted-foreground">Previous: {formatPercent(previous.savingRate, { locale: loc })}</span>} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Income vs expenses"
          description={`Per ${data.granularity} · ${period.label.toLowerCase()}`}
          table={{ columns: ["Period", "Income", "Expenses", "Net"], rows: series.map((s) => [s.label, money(s.income), money(s.expense), money(s.net)]) }}
        >
          {current.transactionCount === 0 ? <EmptyState compact title="No income or expenses in this period" description="Try a different date range or add a transaction." /> : <IncomeExpenseChart data={series} />}
        </ChartCard>
        <ChartCard title="Expense breakdown" description="By category" table={{ columns: ["Category", "Share", "Amount"], rows: breakdown.map((b) => [b.name, `${b.share.toFixed(1)}%`, money(b.value)]) }}>
          {breakdown.length === 0 ? <EmptyState compact title="No expenses yet" /> : <BreakdownChart data={breakdown} total={n(current.expense)} centerLabel="Spent" />}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Cash flow trend" description="Running net cash flow over the period" table={{ columns: ["Period", "Net"], rows: series.map((s) => [s.label, money(s.net)]) }}>
          {current.transactionCount === 0 ? <EmptyState compact title="No cash flow yet" /> : <CashFlowTrendChart data={series} />}
        </ChartCard>
        <ChartCard title="Monthly savings" description={`Income minus expenses · ${formatMonth(data.trendRange.start)} – ${formatMonth(data.trendRange.end)}`} table={{ columns: ["Month", "Saved"], rows: monthlySavings.map((m) => [m.label, money(m.value)]) }}>
          <SignedBarChart data={monthlySavings} name="Saved" />
        </ChartCard>
        <ChartCard title="Net worth trend" description="Month-end, reconstructed from your history" table={{ columns: ["Month", "Assets", "Liabilities", "Net worth"], rows: netWorth.map((p) => [p.label, money(p.assets), money(p.liabilities), money(p.netWorth)]) }}>
          <NetWorthChart data={netWorth} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Latest activity in this period</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transactions">View all <ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState compact title="No transactions in this period" action={<QuickAddButton variant="outline" />} />
            ) : (
              <TransactionList rows={recent.map(toTransactionRow)} locale={loc} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Insights</CardTitle>
            <CardDescription>Generated from your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.insights.length === 0 ? (
              <EmptyState compact title="Not enough data yet" description="Insights appear once you have a few transactions to compare." />
            ) : (
              data.insights.slice(0, 5).map((i) => <FinancialInsightCard key={i.id} insight={i} />)
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Budget utilization</CardTitle>
            <CardDescription>Current periods</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild><Link href="/budgets">Manage</Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.length === 0 ? (
              <EmptyState compact icon={PiggyBank} title="No budgets yet" action={<Button variant="outline" size="sm" asChild><Link href="/budgets?new=1">Create a budget</Link></Button>} />
            ) : (
              data.budgets.slice(0, 5).map((b) => (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{b.name}</span>
                    <span className="tabular text-xs text-muted-foreground">{formatMoney(b.evaluation.spent, cur, { locale: loc, compact: true })} / {formatMoney(b.evaluation.limit, cur, { locale: loc, compact: true })}</span>
                  </div>
                  <BudgetProgress percent={b.evaluation.percent} status={b.evaluation.status} projectedPercent={b.evaluation.projectedPercent} label={`${b.name} budget used`} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Financial goals</CardTitle>
            <CardDescription>Progress toward your targets</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild><Link href="/goals">Manage</Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.goals.length === 0 ? (
              <EmptyState compact title="No goals yet" action={<Button variant="outline" size="sm" asChild><Link href="/goals?new=1">Create a goal</Link></Button>} />
            ) : (
              data.goals.slice(0, 4).map((g) => <GoalProgressSummary key={g.id} name={g.name} color={g.color} progress={g.progress} currency={cur} locale={loc} targetDate={g.targetDate} />)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Financial health</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild><Link href="/analytics?tab=health">Details</Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FinancialHealthScore health={data.health} />
          </CardContent>
        </Card>
      </div>

      {bills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming bills</CardTitle>
            <CardDescription>Due in the next 14 days or overdue</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild><Link href="/bills">View bills</Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bills.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className={b.nextDueDate < ctx.today ? "text-xs text-negative" : "text-xs text-muted-foreground"}>
                      {b.nextDueDate < ctx.today ? "Overdue · " : "Due "}
                      {formatDisplayDate(b.nextDueDate, false)}
                    </span>
                  </span>
                  <Money value={b.amount} currency={b.currency} locale={loc} className="font-medium" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
