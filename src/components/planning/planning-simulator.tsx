"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartCard } from "@/components/charts/chart-card";
import { ProjectionChart } from "@/components/charts/charts";
import { useFormat } from "@/components/shared/format-context";
import { MoneyInput } from "@/components/shared/money-input";
import { EMPTY_SCENARIO, projectScenario, type Baseline, type Scenario } from "@/features/planning/projection";
import { formatMonth } from "@/lib/dates";
import { D } from "@/lib/money";
import { cn } from "@/lib/utils";

type History = { month: string; cash: string; netWorth: string }[];

const PRESETS: { label: string; apply: (b: Baseline) => Partial<Scenario> }[] = [
  { label: "Save Rp500,000 more per month", apply: () => ({ extraSavingsMonthly: "500000" }) },
  { label: "Salary +10%", apply: () => ({ incomeChangePct: 10 }) },
  { label: "Cut food spending 15%", apply: (b) => { const food = b.expenseCategories.find((c) => /food/i.test(c.name)); return food ? { categoryChangePct: { [food.id]: -15 } } : { expenseChangePct: -15 }; } },
  { label: "Buy a Rp12,000,000 laptop", apply: () => ({ plannedPurchases: [{ id: "laptop", label: "Laptop", amount: "12000000", month: 1 }] }) },
  { label: "Lose primary income for 3 months", apply: () => ({ incomeLoss: { months: 3, startMonth: 1, pct: 100 } }) },
];

let uid = 0;
const nextId = () => `item-${++uid}`;

function PctSlider({ id, label, value, onChange, min = -50, max = 50 }: { id: string; label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label htmlFor={id}>{label}</Label>
        <span className="tabular text-muted-foreground">{value > 0 ? "+" : ""}{value}%</span>
      </div>
      <Slider id={id} min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
    </div>
  );
}

export function PlanningSimulator({ baseline, history, assumptions }: { baseline: Baseline; history: History; assumptions: string[] }) {
  const f = useFormat();
  const [horizon, setHorizon] = useState(12);
  const [scenario, setScenario] = useState<Scenario>(EMPTY_SCENARIO);
  const set = (patch: Partial<Scenario>) => setScenario((s) => ({ ...s, ...patch }));

  const base = useMemo(() => projectScenario(baseline, EMPTY_SCENARIO, horizon), [baseline, horizon]);
  const sim = useMemo(() => projectScenario(baseline, scenario, horizon), [baseline, scenario, horizon]);
  const changed = JSON.stringify(scenario) !== JSON.stringify(EMPTY_SCENARIO);
  const m = (v: Parameters<typeof f.money>[0]) => f.money(v);

  const chart = useMemo(() => {
    const rows: Record<string, number | string | null>[] = history.map((h) => ({ label: formatMonth(h.month), actual: D(h.cash).toNumber(), baseline: null, scenario: null }));
    const now = D(baseline.startingCash).toNumber();
    rows.push({ label: "Today", actual: now, baseline: now, scenario: changed ? now : null });
    base.months.forEach((pm, i) => rows.push({ label: formatMonth(pm.month), actual: null, baseline: pm.cash.toNumber(), scenario: changed ? sim.months[i].cash.toNumber() : null }));
    return rows;
  }, [history, base, sim, baseline.startingCash, changed]);

  const topCategories = baseline.expenseCategories.slice(0, 5);
  const noHistory = baseline.monthsOfHistory === 0;

  return (
    <div className="space-y-6">
      {noHistory && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          You don&apos;t have a completed month of history yet, so the forecast only includes bills and recurring transactions. It will improve as you record more data.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" variant="outline" value={String(horizon)} onValueChange={(v) => v && setHorizon(Number(v))} aria-label="Projection horizon">
          <ToggleGroupItem value="3" className="px-3">3 months</ToggleGroupItem>
          <ToggleGroupItem value="6" className="px-3">6 months</ToggleGroupItem>
          <ToggleGroupItem value="12" className="px-3">12 months</ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="outline" className="font-normal">Projection — an estimate, not a guarantee</Badge>
      </div>

      <section aria-label="Projected outcomes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ImpactCard label="Avg monthly cash flow" base={base.averageNet} sim={changed ? sim.averageNet : null} format={m} />
        <ImpactCard label={`Cash balance in ${horizon} mo`} base={base.endCash} sim={changed ? sim.endCash : null} format={m} />
        <ImpactCard label={`Net worth in ${horizon} mo`} base={base.endNetWorth} sim={changed ? sim.endNetWorth : null} format={m} />
        <ImpactCard label="Emergency fund coverage" base={base.emergencyCoverage} sim={changed ? sim.emergencyCoverage : null} format={(v) => `${D(v ?? 0).toDecimalPlaces(1).toString()} months`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Projected cash balance"
          description="Liquid accounts: actual month-end history (solid), then projections (dashed)"
          table={{ columns: ["Month", "Actual", "Baseline", "Scenario"], rows: chart.map((r) => [String(r.label), r.actual === null ? "—" : m(r.actual as number), r.baseline === null ? "—" : m(r.baseline as number), r.scenario === null ? "—" : m(r.scenario as number)]) }}
        >
          <ProjectionChart
            data={chart}
            series={[
              { key: "actual", label: "Actual", color: "var(--chart-1)" },
              { key: "baseline", label: "Projected (current trend)", color: "var(--muted-foreground)", dashed: true },
              ...(changed ? [{ key: "scenario", label: "Projected (your scenario)", color: "var(--chart-2)", dashed: true }] : []),
            ]}
          />
          {(changed ? sim : base).firstNegativeMonth !== null && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-negative">
              <AlertTriangle className="size-4" aria-hidden /> Cash is projected to go negative in month {(changed ? sim : base).firstNegativeMonth} (lowest {m((changed ? sim : base).minCash)}).
            </p>
          )}
        </ChartCard>

        <Card>
          <CardHeader>
            <CardTitle>Baseline</CardTitle>
            <CardDescription>What the forecast starts from</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["Liquid balance today", baseline.startingCash],
                ["Net worth today", baseline.startingNetWorth],
                ["Avg variable income / month", baseline.avgVariableIncome],
                ["Recurring income / month", baseline.recurringIncome],
                ["Avg variable spending / month", baseline.expenseCategories.reduce((a, c) => a.plus(c.monthly), D(0)).toFixed(2)],
                ["Bills & recurring spending / month", baseline.recurringExpense],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="tabular font-medium">{m(v)}</dd></div>
              ))}
              {baseline.monthlyBudgetTotal && (
                <div className="flex justify-between gap-3 border-t pt-2">
                  <dt className="text-muted-foreground">Budget sustainability</dt>
                  <dd className={cn("flex items-center gap-1 font-medium", (changed ? sim : base).budgetSustainable ? "text-positive" : "text-negative")}>
                    {(changed ? sim : base).budgetSustainable ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                    {(changed ? sim : base).budgetSustainable ? "Within monthly budget" : "Above monthly budget"}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>What-if simulator</CardTitle>
            <CardDescription>Adjust assumptions — results update instantly. Nothing is saved to your records.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => setScenario(EMPTY_SCENARIO)} disabled={!changed}><RotateCcw /> Reset</Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.label} size="sm" variant="outline" onClick={() => setScenario({ ...EMPTY_SCENARIO, ...p.apply(baseline) })}>{p.label}</Button>
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <PctSlider id="income-change" label="Income change" value={scenario.incomeChangePct} onChange={(v) => set({ incomeChangePct: v })} />
              <PctSlider id="expense-change" label="Overall spending change" value={scenario.expenseChangePct} onChange={(v) => set({ expenseChangePct: v })} />
              <div className="space-y-2">
                <Label htmlFor="extra-savings">Extra savings per month</Label>
                <MoneyInput id="extra-savings" value={scenario.extraSavingsMonthly === "0" ? "" : scenario.extraSavingsMonthly} onChange={(v) => set({ extraSavingsMonthly: v || "0" })} currency={baseline.currency} locale={f.locale} />
                <p className="text-xs text-muted-foreground">Modelled as spending less; allocated to goals by priority.</p>
              </div>
              <div className="space-y-2">
                <Label>Lose income</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={12} value={scenario.incomeLoss?.months ?? 0} onChange={(e) => { const months = Math.max(0, Math.min(12, Number(e.target.value) || 0)); set({ incomeLoss: months ? { months, startMonth: scenario.incomeLoss?.startMonth ?? 1, pct: scenario.incomeLoss?.pct ?? 100 } : null }); }} className="w-20" aria-label="Months without income" />
                  <span className="text-sm text-muted-foreground">months, starting month</span>
                  <Input type="number" min={1} max={12} value={scenario.incomeLoss?.startMonth ?? 1} disabled={!scenario.incomeLoss} onChange={(e) => scenario.incomeLoss && set({ incomeLoss: { ...scenario.incomeLoss, startMonth: Math.max(1, Math.min(12, Number(e.target.value) || 1)) } })} className="w-16" aria-label="Starting month" />
                </div>
                {scenario.incomeLoss && <PctSlider id="loss-pct" label="Share of income lost" value={scenario.incomeLoss.pct} min={10} max={100} onChange={(v) => set({ incomeLoss: { ...scenario.incomeLoss!, pct: v } })} />}
              </div>
            </div>

            {topCategories.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Category adjustments</p>
                <div className="grid gap-5 md:grid-cols-2">
                  {topCategories.map((c) => (
                    <PctSlider key={c.id} id={`cat-${c.id}`} label={`${c.name} (${m(c.monthly)}/mo)`} value={scenario.categoryChangePct[c.id] ?? 0} onChange={(v) => set({ categoryChangePct: { ...scenario.categoryChangePct, [c.id]: v } })} />
                  ))}
                </div>
              </div>
            )}

            <OneOffList title="Planned purchases" items={scenario.plannedPurchases} horizon={horizon} currency={baseline.currency} onChange={(items) => set({ plannedPurchases: items })} />
            <OneOffList title="Emergency expenses" items={scenario.emergencyExpenses} horizon={horizon} currency={baseline.currency} onChange={(items) => set({ emergencyExpenses: items })} />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">New recurring bills</p>
                <Button size="sm" variant="outline" onClick={() => set({ newBills: [...scenario.newBills, { id: nextId(), label: "New bill", monthlyAmount: "", startMonth: 1 }] })}><Plus /> Add</Button>
              </div>
              {scenario.newBills.map((b, i) => (
                <div key={b.id} className="grid grid-cols-[1fr_1fr_80px_auto] items-center gap-2">
                  <Input value={b.label} onChange={(e) => set({ newBills: scenario.newBills.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Bill name" />
                  <MoneyInput value={b.monthlyAmount} onChange={(v) => set({ newBills: scenario.newBills.map((x, j) => (j === i ? { ...x, monthlyAmount: v } : x)) })} currency={baseline.currency} locale={f.locale} aria-describedby={undefined} />
                  <Input type="number" min={1} max={horizon} value={b.startMonth} onChange={(e) => set({ newBills: scenario.newBills.map((x, j) => (j === i ? { ...x, startMonth: Math.max(1, Number(e.target.value) || 1) } : x)) })} aria-label="Starting month" />
                  <Button size="icon" variant="ghost" onClick={() => set({ newBills: scenario.newBills.filter((_, j) => j !== i) })} aria-label="Remove bill"><Trash2 /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Goal completion</CardTitle><CardDescription>Estimated at your recent contribution pace</CardDescription></CardHeader>
            <CardContent>
              {baseline.goals.length === 0 ? <p className="text-sm text-muted-foreground">No goals yet.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Goal</TableHead><TableHead>Current</TableHead>{changed && <TableHead>Scenario</TableHead>}</TableRow></TableHeader>
                  <TableBody>
                    {base.goals.map((g, i) => {
                      const s = sim.goals[i];
                      const label = (x: typeof g) => (x.months === 0 ? "Done" : x.date ? formatMonth(x.date) : "Not reached");
                      return (
                        <TableRow key={g.id}>
                          <TableCell className="max-w-28 truncate">{g.name}</TableCell>
                          <TableCell className={cn(g.onTime === false && "text-negative")}>{label(g)}</TableCell>
                          {changed && <TableCell className={cn(s.onTime === false && "text-negative", s.months !== null && g.months !== null && s.months < g.months && "text-positive")}>{label(s)}</TableCell>}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Assumptions</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
                {assumptions.map((a) => <li key={a}>{a}</li>)}
                <li>Projections are estimates and will differ from actual results.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ImpactCard({ label, base, sim, format }: { label: string; base: D_ | null; sim: D_ | null; format: (v: D_ | null) => string }) {
  const diff = sim !== null && base !== null ? sim.minus(base) : null;
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight tabular">{base === null ? "—" : format(sim ?? base)}</p>
        <p className="text-xs text-muted-foreground">
          {diff === null ? "Current trend" : (
            <>Current trend {format(base)} · <span className={cn("font-medium", diff.greaterThan(0) ? "text-positive" : diff.lessThan(0) ? "text-negative" : "")}>{diff.greaterThan(0) ? "+" : diff.lessThan(0) ? "−" : "±"}{format(diff.abs())}</span></>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

type D_ = ReturnType<typeof D>;

function OneOffList({ title, items, horizon, currency, onChange }: { title: string; items: Scenario["plannedPurchases"]; horizon: number; currency: string; onChange: (items: Scenario["plannedPurchases"]) => void }) {
  const f = useFormat();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, { id: nextId(), label: title === "Planned purchases" ? "Purchase" : "Emergency", amount: "", month: 1 }])}><Plus /> Add</Button>
      </div>
      {items.map((p, i) => (
        <div key={p.id} className="grid grid-cols-[1fr_1fr_80px_auto] items-center gap-2">
          <Input value={p.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Label" />
          <MoneyInput value={p.amount} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, amount: v } : x)))} currency={currency} locale={f.locale} />
          <Input type="number" min={1} max={horizon} value={p.month} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, month: Math.max(1, Math.min(horizon, Number(e.target.value) || 1)) } : x)))} aria-label="In month" title="Month number" />
          <Button size="icon" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
        </div>
      ))}
      {items.length > 0 && <p className="text-xs text-muted-foreground">Last column: month number within the projection (1 = next month).</p>}
    </div>
  );
}
