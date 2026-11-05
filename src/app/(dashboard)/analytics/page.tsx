import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, BarChart3, Info, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";
import { ANALYTICS_TABS } from "@/components/analytics/tabs-config";
import { CashFlowExplorer } from "@/components/analytics/cash-flow-explorer";
import { FinancialHealthScore } from "@/components/analytics/financial-health-score";
import { ChartCard } from "@/components/charts/chart-card";
import { BreakdownChart, ComparisonLineChart, NetWorthChart, SignedBarChart, SimpleBarChart, StackedCategoryChart } from "@/components/charts/charts";
import { FinancialInsightCard } from "@/components/dashboard/financial-insight-card";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { Delta } from "@/components/shared/delta";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserContext } from "@/lib/dal";
import { WEEKDAY_LABELS, formatDisplayDate, formatMonth } from "@/lib/dates";
import { formatMoney, formatPercent, percentChange } from "@/lib/money";
import { periodFromSearchParams } from "@/lib/period";
import { buildAnalytics, n } from "@/features/analytics/service";
import { ACCOUNT_TYPE_LABELS } from "@/features/finance/types";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}

async function Analytics({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  const { user, ctx } = await requireUserContext();
  const raw = await searchParams;
  const period = periodFromSearchParams(raw, ctx.today, ctx.weekStartsOn, "last_6_months");
  const tabParam = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const tab = ANALYTICS_TABS.some(([k]) => k === tabParam) ? tabParam! : "cashflow";
  const a = await buildAnalytics(user.id, period);
  const cur = ctx.baseCurrency;
  const loc = ctx.locale;
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, cur, { locale: loc });

  const months = a.months.map((m) => ({ label: formatMonth(m.month), income: n(m.income), expense: n(m.expense), net: n(m.net), savingRate: m.savingRate }));
  const breakdown = a.expenseBreakdown.map((r) => ({ id: r.categoryId ?? "none", name: r.name, color: r.color, value: n(r.amount), share: r.share.toNumber() }));
  const incomeBreakdown = a.incomeBreakdown.map((r) => ({ id: r.categoryId ?? "none", name: r.name, color: r.color, value: n(r.amount), share: r.share.toNumber() }));
  const weekday = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ label: WEEKDAY_LABELS[d], value: n(a.spending.weekday[d].average) }));
  const netWorth = a.netWorth.map((p) => ({ label: formatMonth(p.month), netWorth: n(p.netWorth), assets: n(p.assets), liabilities: n(p.liabilities) }));
  const typeColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];
  const assetDist = a.position.assetDistribution.map((d, i) => ({ id: d.type, name: ACCOUNT_TYPE_LABELS[d.type], color: typeColors[i % 8], value: n(d.amount), share: a.position.assets.isZero() ? 0 : d.amount.div(a.position.assets).times(100).toNumber() }));
  const liabilityDist = a.position.liabilityDistribution.map((d, i) => ({ id: d.type, name: ACCOUNT_TYPE_LABELS[d.type], color: typeColors[(i + 1) % 8], value: n(d.amount), share: a.position.liabilities.isZero() ? 0 : d.amount.div(a.position.liabilities).times(100).toNumber() }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`${period.label} · ${formatDisplayDate(period.range.start)} – ${formatDisplayDate(period.range.end)} · compared with the previous period of equal length`}
        actions={<DateRangeFilter current={period.preset} label={period.label} from={period.from} to={period.to} />}
      />

      {!a.hasData ? (
        <Card><CardContent><EmptyState icon={BarChart3} title="Nothing to analyse yet" description="Add accounts and transactions to unlock analytics." /></CardContent></Card>
      ) : (
        <AnalyticsTabs value={tab}>
          <TabsContent value="cashflow" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FinancialSummaryCard label="Income" value={money(a.current.income)} footer={<Delta value={percentChange(a.current.income, a.previous.income)} label="vs previous period" />} />
              <FinancialSummaryCard label="Expenses" value={money(a.current.expense)} footer={<Delta value={percentChange(a.current.expense, a.previous.expense)} upIsGood={false} label="vs previous period" />} />
              <FinancialSummaryCard label="Net cash flow" value={<Money value={a.current.net} currency={cur} locale={loc} tone="auto" sign />} hint="Net Cash Flow = Income − Expenses" footer={<span className="text-xs text-muted-foreground">Previous: {money(a.previous.net)}</span>} />
              <FinancialSummaryCard label="Saving rate" value={formatPercent(a.current.savingRate, { locale: loc })} hint="Saving Rate = (Income − Expenses) ÷ Income × 100%. Undefined when income is zero." footer={<span className="text-xs text-muted-foreground">Previous: {formatPercent(a.previous.savingRate, { locale: loc })}</span>} />
            </div>
            <CashFlowExplorer series={a.series} initial={a.granularity} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title={`Expenses: ${a.year} vs ${a.year - 1}`} description="Monthly spending, year over year" table={{ columns: ["Month", String(a.year), String(a.year - 1)], rows: a.yoy.map((r) => [r.label, r.current === null ? "—" : money(r.current), money(r.previous)]) }}>
                <ComparisonLineChart data={a.yoy} current={String(a.year)} previous={String(a.year - 1)} />
              </ChartCard>
              <ChartCard title="Monthly net cash flow" description="History across the trend window" table={{ columns: ["Month", "Income", "Expenses", "Net", "Saving rate"], rows: months.map((m) => [m.label, money(m.income), money(m.expense), money(m.net), formatPercent(m.savingRate, { locale: loc })]) }}>
                <SignedBarChart data={months.map((m) => ({ label: m.label, value: m.net }))} name="Net cash flow" />
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="spending" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FinancialSummaryCard label="Average daily expenses" value={money(a.spending.averageDaily)} hint="Total expenses ÷ days elapsed in the period." />
              <FinancialSummaryCard label="Average monthly expenses" value={money(a.spending.averageMonthly)} hint={`Mean over ${a.spending.completedMonthCount} completed month(s) with spending, out of the last 6.`} />
              <FinancialSummaryCard label="Scheduled (recurring) expenses" value={money(a.spending.scheduledExpense)} hint="Bill payments and recurring transactions in this period." />
              <FinancialSummaryCard label="Top category" value={a.expenseBreakdown[0]?.name ?? "—"} footer={a.expenseBreakdown[0] && <span className="text-xs text-muted-foreground">{money(a.expenseBreakdown[0].amount)} · {a.expenseBreakdown[0].share.toDecimalPlaces(1).toString()}%</span>} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Top spending categories" description="Subcategories rolled into their parent" table={{ columns: ["Category", "Share", "Amount"], rows: breakdown.map((b) => [b.name, `${b.share.toFixed(1)}%`, money(b.value)]) }}>
                {breakdown.length ? <BreakdownChart data={breakdown} total={n(a.current.expense)} centerLabel="Spent" /> : <EmptyState compact title="No expenses in this period" />}
              </ChartCard>
              <ChartCard title="Monthly spending by category" description="Top 5 categories of the period, others combined" table={{ columns: ["Month", ...a.spending.categoryTrendKeys.map((k) => k.name), "Other"], rows: a.spending.categoryTrend.map((r) => [String(r.label), ...a.spending.categoryTrendKeys.map((k) => money(Number(r[k.key] ?? 0))), money(Number(r.other ?? 0))]) }}>
                <StackedCategoryChart data={a.spending.categoryTrend} keys={a.spending.categoryTrendKeys.map((k) => ({ key: k.key, name: k.name, color: k.color }))} />
              </ChartCard>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Spending by weekday" description="Average spent per calendar day of each weekday" table={{ columns: ["Weekday", "Average", "Total"], rows: [1, 2, 3, 4, 5, 6, 0].map((d) => [WEEKDAY_LABELS[d], money(a.spending.weekday[d].average), money(a.spending.weekday[d].total)]) }}>
                <SimpleBarChart data={weekday} name="Average per day" />
              </ChartCard>
              <Card>
                <CardHeader><CardTitle>Largest transactions</CardTitle><CardDescription>Biggest expenses in the period</CardDescription></CardHeader>
                <CardContent>
                  {a.spending.largest.length === 0 ? <EmptyState compact title="No expenses" /> : (
                    <ul className="divide-y">
                      {a.spending.largest.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0"><span className="block truncate font-medium">{t.description}</span><span className="text-xs text-muted-foreground">{t.category} · {formatDisplayDate(t.date)}</span></span>
                          <span className="tabular font-medium">{money(t.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Recurring expenses</CardTitle><CardDescription>Detected monthly charges over the last 6 months</CardDescription></CardHeader>
                <CardContent>
                  {a.spending.recurringPatterns.length === 0 ? <EmptyState compact icon={Repeat} title="No recurring patterns detected" description="Needs at least 3 similar monthly charges." /> : (
                    <ul className="divide-y">
                      {a.spending.recurringPatterns.slice(0, 10).map((p) => (
                        <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 truncate font-medium">{p.description}{!p.tracked && <Badge variant="outline" className="font-normal">Not tracked</Badge>}</span>
                            <span className="text-xs text-muted-foreground">{p.occurrences}× · every ~{Math.round(p.medianIntervalDays)} days · last {formatDisplayDate(p.lastDate)}</span>
                          </span>
                          <span className="tabular">{money(p.averageAmount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <ChartCard title="Income sources" description="By category" table={{ columns: ["Category", "Share", "Amount"], rows: incomeBreakdown.map((b) => [b.name, `${b.share.toFixed(1)}%`, money(b.value)]) }}>
                {incomeBreakdown.length ? <BreakdownChart data={incomeBreakdown} total={n(a.current.income)} centerLabel="Earned" /> : <EmptyState compact title="No income in this period" />}
              </ChartCard>
            </div>
            <Card>
              <CardHeader><CardTitle>All categories</CardTitle><CardDescription>Including subcategories</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Share</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {a.spending.detailedBreakdown.map((r) => (
                      <TableRow key={r.categoryId ?? "none"}>
                        <TableCell><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />{r.name}</span></TableCell>
                        <TableCell className="tabular text-right">{r.count}</TableCell>
                        <TableCell className="tabular text-right">{r.share.toDecimalPlaces(1).toString()}%</TableCell>
                        <TableCell className="tabular text-right">{money(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="networth" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FinancialSummaryCard label="Current net worth" value={money(a.position.netWorth)} emphasis hint="Net Worth = Total Assets − Total Liabilities" />
              <FinancialSummaryCard label="Growth over the window" value={<Money value={a.netWorthGrowth.change} currency={cur} locale={loc} tone="auto" sign />} footer={<Delta value={a.netWorthGrowth.percent} label={`since ${formatMonth(a.trendRange.start)}`} />} />
              <FinancialSummaryCard label="Total assets" value={money(a.position.assets)} />
              <FinancialSummaryCard label="Total liabilities" value={money(a.position.liabilities)} />
            </div>
            <ChartCard title="Net worth history" description="Month-end values reconstructed from opening balances and every transaction — not today's balances projected backwards." table={{ columns: ["Month", "Assets", "Liabilities", "Net worth"], rows: netWorth.map((p) => [p.label, money(p.assets), money(p.liabilities), money(p.netWorth)]) }}>
              <NetWorthChart data={netWorth} height={300} />
            </ChartCard>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Asset distribution" description="By account type">
                {assetDist.length ? <BreakdownChart data={assetDist} total={n(a.position.assets)} centerLabel="Assets" /> : <EmptyState compact title="No assets" />}
              </ChartCard>
              <ChartCard title="Liability distribution" description="By account type">
                {liabilityDist.length ? <BreakdownChart data={liabilityDist} total={n(a.position.liabilities)} centerLabel="Owed" /> : <EmptyState compact title="No liabilities — nice." />}
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="health" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Financial health score</CardTitle><CardDescription>Transparent breakdown, from your last 6 completed months and current balances</CardDescription></CardHeader>
                <CardContent><FinancialHealthScore health={a.health} detailed /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>How the score works</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Each indicator earns points on a straight line between a &quot;no points&quot; level and a &quot;full points&quot; level. Weights: saving rate 25, emergency fund 25, debt-to-asset 20, cash-flow stability 15, budget adherence 15.</p>
                  <p>Indicators without enough data are left out, and the score is rescaled to the remaining weight. A score needs at least half the total weight.</p>
                  <p>Emergency fund uses your Emergency Fund goals if you have any; otherwise your liquid balance ({a.emergencyFund.source === "goal" ? "currently using goals" : "currently using liquid balance"}).</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="intelligence" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Unusual activity</CardTitle><CardDescription>Statistical flags worth a second look — not accusations of fraud</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {a.anomalies.length === 0 ? (
                    <EmptyState compact icon={Info} title="Nothing unusual detected" description="Detection needs some history: at least 6 past expenses per category, and 2–3 months of data for trends." />
                  ) : (
                    a.anomalies.map((x) => (
                      <div key={x.id} className="space-y-1 rounded-lg border p-3">
                        <p className="flex items-start gap-2 text-sm font-medium">
                          <AlertTriangle className={x.severity === "warning" ? "mt-0.5 size-4 shrink-0 text-warning" : "mt-0.5 size-4 shrink-0 text-muted-foreground"} aria-hidden />
                          <span className="flex-1">{x.title}</span>
                          {x.amount && <span className="tabular font-normal">{money(x.amount)}</span>}
                        </p>
                        <p className="pl-6 text-sm text-muted-foreground">{x.detail}</p>
                        <p className="pl-6 text-xs text-muted-foreground">Method: {x.method}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Insights</CardTitle><CardDescription>Plain-language observations from your figures</CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  {a.insights.length === 0 ? <EmptyState compact title="Not enough data yet" /> : a.insights.map((i) => <FinancialInsightCard key={i.id} insight={i} />)}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </AnalyticsTabs>
      )}
    </div>
  );
}
