import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContributionDialog, GoalMenu, NewGoalButton, RemoveContributionButton } from "@/components/goals/goal-actions";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserContext } from "@/lib/dal";
import { formatDateOnly, formatDisplayDate } from "@/lib/dates";
import { formatMoney, sum } from "@/lib/money";
import { listActiveAccounts } from "@/features/accounts/service";
import { GOAL_CATEGORY_LABELS } from "@/features/goals/schemas";
import { listGoalsWithProgress } from "@/features/goals/service";

export const metadata: Metadata = { title: "Financial Goals" };

export default function GoalsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" />}>
      <Goals />
    </Suspense>
  );
}

async function Goals() {
  const { user, ctx } = await requireUserContext();
  const [goals, accounts] = await Promise.all([listGoalsWithProgress(user.id), listActiveAccounts(user.id)]);
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, ctx.baseCurrency, { locale: ctx.locale });
  const today = formatDateOnly(ctx.today);
  const active = goals.filter((g) => !g.progress.isCompleted);

  return (
    <div className="space-y-6">
      <PageHeader title="Financial goals" description="Contributions earmark savings toward a goal; your account balances stay the source of truth." actions={<NewGoalButton accounts={accounts} />} />
      {goals.length === 0 ? (
        <Card><CardContent><EmptyState icon={Target} title="No goals yet" description="An emergency fund is a great first goal. Add a target amount and, optionally, a date." /></CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <FinancialSummaryCard label="Saved across goals" value={money(sum(goals.map((g) => g.progress.current)))} emphasis />
            <FinancialSummaryCard label="Still to save (active)" value={money(sum(active.map((g) => g.progress.remaining)))} />
            <FinancialSummaryCard label="Monthly needed for dated goals" value={money(sum(active.map((g) => g.progress.requiredMonthly ?? 0)))} hint="Sum of the monthly saving required to hit each goal's target date." />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {goals.map((g) => {
              const p = g.progress;
              const pct = Math.min(100, p.percent.toNumber());
              return (
                <Card key={g.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                      {g.name}
                      <Badge variant="outline" className="font-normal">{GOAL_CATEGORY_LABELS[g.category]}</Badge>
                      <Badge variant="secondary" className="font-normal">{g.priority[0] + g.priority.slice(1).toLowerCase()} priority</Badge>
                    </CardTitle>
                    {g.description && <CardDescription>{g.description}</CardDescription>}
                    <CardAction>
                      <GoalMenu
                        goalId={g.id}
                        name={g.name}
                        accounts={accounts}
                        initial={{ name: g.name, category: g.category, targetAmount: g.targetAmount.toFixed(), targetDate: g.targetDate ?? "", priority: g.priority, linkedAccountId: g.linkedAccountId ?? "none", description: g.description ?? "", notes: g.notes ?? "", color: g.color }}
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-2xl font-semibold tracking-tight tabular">{money(p.current)}</p>
                        <p className="text-xs text-muted-foreground">of {money(p.target)} · {p.percent.toDecimalPlaces(0).toString()}%</p>
                      </div>
                      {p.isCompleted ? (
                        <span className="flex items-center gap-1 text-sm text-positive"><CheckCircle2 className="size-4" aria-hidden /> Completed</span>
                      ) : p.isOverdue ? (
                        <span className="flex items-center gap-1 text-sm text-negative"><AlertTriangle className="size-4" aria-hidden /> Overdue</span>
                      ) : (
                        <span className="text-right text-sm"><span className="font-medium">{money(p.remaining)}</span><span className="block text-xs text-muted-foreground">remaining</span></span>
                      )}
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label={`${g.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                    </div>
                    {!p.isCompleted && (
                      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3.5" aria-hidden /> Target date</dt>
                          <dd>{g.targetDate ? formatDisplayDate(g.targetDate) : "Not set"}{p.daysRemaining !== null && p.daysRemaining >= 0 && <span className="block text-xs text-muted-foreground">{p.monthsRemaining} month{p.monthsRemaining === 1 ? "" : "s"} left</span>}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Needed per month</dt>
                          <dd className="tabular">{p.requiredMonthly ? money(p.requiredMonthly) : "Set a target date"}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="size-3.5" aria-hidden /> At recent pace</dt>
                          <dd>
                            {p.estimatedCompletionDate ? formatDisplayDate(p.estimatedCompletionDate) : "No recent contributions"}
                            <span className="block text-xs text-muted-foreground">{money(p.averageMonthlyContribution)}/month{p.onTrack === false ? " · behind schedule" : p.onTrack ? " · on track" : ""}</span>
                          </dd>
                        </div>
                      </dl>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {!p.isCompleted && <ContributionDialog goalId={g.id} goalName={g.name} type="CONTRIBUTION" today={today} />}
                      <ContributionDialog goalId={g.id} goalName={g.name} type="WITHDRAWAL" max={p.current.toFixed()} today={today} />
                      {g.linkedAccount && <span className="ml-auto self-center text-xs text-muted-foreground">Kept in {g.linkedAccount.name}</span>}
                    </div>
                    {g.contributions.length > 0 && (
                      <details className="group border-t pt-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">History ({g.contributions.length})</summary>
                        <ul className="mt-2 max-h-48 divide-y overflow-auto text-sm">
                          {g.contributions.map((c) => (
                            <li key={c.id} className="flex items-center gap-2 py-1.5">
                              <span className="tabular w-24 text-xs text-muted-foreground">{formatDisplayDate(c.date)}</span>
                              <span className="min-w-0 flex-1 truncate text-xs">{c.note ?? (c.type === "CONTRIBUTION" ? "Contribution" : "Withdrawal")}</span>
                              <span className={c.type === "CONTRIBUTION" ? "tabular text-positive" : "tabular"}>{c.type === "CONTRIBUTION" ? "+" : "−"}{money(c.amount)}</span>
                              <RemoveContributionButton id={c.id} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
