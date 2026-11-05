import type { Metadata } from "next";
import { Suspense } from "react";
import { PiggyBank } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetMenu, NewBudgetButton } from "@/components/budgets/budget-manager";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { EmptyState } from "@/components/shared/empty-state";
import { IconBadge } from "@/components/shared/icon";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserContext } from "@/lib/dal";
import { formatDateOnly, formatRangeLabel, parseDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { BUDGET_PERIOD_LABELS } from "@/features/budgets/schemas";
import { getBudgetOverview } from "@/features/budgets/service";
import { listCategories } from "@/features/categories/service";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" />}>
      <Budgets />
    </Suspense>
  );
}

async function Budgets() {
  const { user, ctx } = await requireUserContext();
  const [budgets, categories] = await Promise.all([getBudgetOverview(user.id), listCategories(user.id)]);
  const today = formatDateOnly(ctx.today);
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, ctx.baseCurrency, { locale: ctx.locale });
  const t = ctx.thresholds;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description={`Status levels: normal from ${t.normal}%, moderate from ${t.moderate}%, approaching limit from ${t.warning}%. Change them in Settings.`}
        actions={<NewBudgetButton categories={categories} today={today} />}
      />
      {budgets.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={PiggyBank} title="No budgets yet" description="Budgets help you keep spending in check. Start with a monthly total, then add limits for your biggest categories." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {budgets.map((b) => {
            const ev = b.evaluation;
            const range = { start: parseDateOnly(b.range.start), end: parseDateOnly(b.range.end) };
            return (
              <Card key={b.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {b.name}
                    <Badge variant="outline" className="font-normal">{BUDGET_PERIOD_LABELS[b.period]}</Badge>
                    {!b.isCurrent && <Badge variant="secondary">{range.end < ctx.today ? "Ended" : "Upcoming"}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {formatRangeLabel(range)} · day {ev.elapsedDays} of {ev.totalDays}
                  </CardDescription>
                  <CardAction>
                    <BudgetMenu
                      budgetId={b.id}
                      name={b.name}
                      categories={categories}
                      today={today}
                      initial={{ name: b.name, period: b.period, amount: ev.limit.toFixed(), startDate: b.startDate, endDate: b.endDate ?? "", alertsEnabled: b.alertsEnabled, notes: b.notes ?? "", lines: b.lines.map((l) => ({ categoryId: l.categoryId, amount: l.amount.toFixed() })) }}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight tabular">{money(ev.spent)}</p>
                      <p className="text-xs text-muted-foreground">spent of {money(ev.limit)}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className={ev.remaining.isNegative() ? "font-medium text-negative" : "font-medium"}>
                        {ev.remaining.isNegative() ? `${money(ev.remaining.negated())} over` : `${money(ev.remaining)} left`}
                      </p>
                      {ev.dailyAllowance && b.isCurrent && <p className="text-xs text-muted-foreground">{money(ev.dailyAllowance)} / day for the rest of the period</p>}
                    </div>
                  </div>
                  <BudgetProgress percent={ev.percent} status={ev.status} projectedPercent={b.isCurrent ? ev.projectedPercent : null} label={`${b.name} budget used`} />
                  {b.isCurrent && ev.elapsedDays > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Projected by period end: <span className="tabular font-medium text-foreground">{money(ev.projected)}</span>
                      {ev.projectedPercent && ` (${ev.projectedPercent.toDecimalPlaces(0).toString()}% of limit)`} — straight-line estimate from your pace so far.
                    </p>
                  )}
                  {b.lines.length > 0 && (
                    <ul className="space-y-3 border-t pt-4">
                      {b.lines.map((l) => (
                        <li key={l.categoryId} className="space-y-1.5">
                          <div className="flex items-center gap-2 text-sm">
                            <IconBadge name={l.icon} color={l.color} size="sm" />
                            <span className="min-w-0 flex-1 truncate">{l.name}</span>
                            <span className="tabular text-xs text-muted-foreground">{money(l.evaluation.spent)} / {money(l.amount)}</span>
                          </div>
                          <BudgetProgress percent={l.evaluation.percent} status={l.evaluation.status} compact label={`${l.name} budget used`} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {b.notes && <p className="text-xs text-muted-foreground">{b.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
