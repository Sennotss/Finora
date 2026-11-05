"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormat } from "@/components/shared/format-context";
import { AXIS, ChartTooltip, Legend, type SeriesKey } from "./chart-parts";

export type CashFlowPoint = { key: string; label: string; income: number; expense: number; net: number };

function useAxisFormat() {
  const f = useFormat();
  return { compact: (v: number) => f.money(v, { compact: true }), full: (v: number) => f.money(v) };
}

const INCOME: SeriesKey = { key: "income", label: "Income", color: "var(--income)" };
const EXPENSE: SeriesKey = { key: "expense", label: "Expenses", color: "var(--expense)" };
const NET: SeriesKey = { key: "net", label: "Net cash flow", color: "var(--net)" };

/** Income vs expense columns per bucket with the net as a line on the same scale. */
export function IncomeExpenseChart({ data, height = 260, showNet = true }: { data: CashFlowPoint[]; height?: number; showNet?: boolean }) {
  const fmt = useAxisFormat();
  return (
    <div className="space-y-3">
      <Legend items={showNet ? [INCOME, EXPENSE, NET] : [INCOME, EXPENSE]} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="income" name="Income" fill={INCOME.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="expense" name="Expenses" fill={EXPENSE.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
          {showNet && <Line dataKey="net" name="Net cash flow" stroke={NET.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} type="monotone" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Running (cumulative) net cash flow across the period. */
export function CashFlowTrendChart({ data, height = 240 }: { data: CashFlowPoint[]; height?: number }) {
  const fmt = useAxisFormat();
  const cumulative = data.reduce<{ label: string; value: number; net: number }[]>(
    (acc, d) => [...acc, { label: d.label, value: (acc[acc.length - 1]?.value ?? 0) + d.net, net: d.net }],
    [],
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={cumulative} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--net)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--net)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...AXIS} minTickGap={16} />
        <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
        <Area dataKey="value" name="Cumulative net" stroke="var(--net)" strokeWidth={2} fill="url(#cf-fill)" type="monotone" activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type BreakdownSlice = { id: string; name: string; color: string; value: number; share: number };

/** Donut with a ranked list beside it (the list doubles as legend and direct labels). */
export function BreakdownChart({ data, total, centerLabel = "Total" }: { data: BreakdownSlice[]; total: number; centerLabel?: string }) {
  const f = useFormat();
  const top = data.slice(0, 7);
  const rest = data.slice(7);
  const slices = rest.length ? [...top, { id: "other", name: "Other", color: "#94a3b8", value: rest.reduce((a, r) => a + r.value, 0), share: rest.reduce((a, r) => a + r.share, 0) }] : top;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative mx-auto size-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={1} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.id} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={(p) => <ChartTooltip {...p} format={(v) => f.money(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
          <span className="tabular text-sm font-semibold">{f.money(total, { compact: true })}</span>
        </div>
      </div>
      <ul className="space-y-2">
        {slices.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="tabular text-xs text-muted-foreground">{s.share.toFixed(1)}%</span>
            <span className="tabular w-28 text-right font-medium">{f.money(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Single-series columns around a zero baseline (e.g. monthly savings). */
export function SignedBarChart({ data, name, height = 220, color = "var(--net)" }: { data: { label: string; value: number }[]; name: string; height?: number; color?: string }) {
  const fmt = useAxisFormat();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
        <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 4, 4]} maxBarSize={24}>
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={d.value < 0 ? 0.55 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Net worth over time as a line with a light area wash. */
export function NetWorthChart({ data, height = 240 }: { data: { label: string; netWorth: number; assets: number; liabilities: number }[]; height?: number }) {
  const fmt = useAxisFormat();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.14} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} domain={["auto", "auto"]} />
        <Tooltip content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
        <Area dataKey="netWorth" name="Net worth" stroke="var(--chart-1)" strokeWidth={2} fill="url(#nw-fill)" type="monotone" dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Stacked monthly columns for the top categories (+ Other), 2px surface gap between segments. */
export function StackedCategoryChart({ data, keys, height = 260 }: { data: Record<string, string | number>[]; keys: { key: string; name: string; color: string }[]; height?: number }) {
  const fmt = useAxisFormat();
  const series = [...keys, { key: "other", name: "Other", color: "#94a3b8" }];
  return (
    <div className="space-y-3">
      <Legend items={series.map((s) => ({ key: s.key, label: s.name, color: s.color }))} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={2} maxBarSize={28} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two comparable series over the same x axis (e.g. this year vs last year). */
export function ComparisonLineChart({ data, current, previous, height = 240 }: { data: { label: string; current: number | null; previous: number }[]; current: string; previous: string; height?: number }) {
  const fmt = useAxisFormat();
  return (
    <div className="space-y-3">
      <Legend items={[{ key: "c", label: current, color: "var(--chart-1)" }, { key: "p", label: previous, color: "var(--chart-2)" }]} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} />
          <Tooltip content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
          <Line dataKey="previous" name={previous} stroke="var(--chart-2)" strokeWidth={2} dot={false} type="monotone" activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          <Line dataKey="current" name={current} stroke="var(--chart-1)" strokeWidth={2} dot={false} type="monotone" connectNulls={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series columns (e.g. average spending by weekday). */
export function SimpleBarChart({ data, name, height = 200, color = "var(--chart-1)" }: { data: { label: string; value: number }[]; name: string; height?: number; color?: string }) {
  const fmt = useAxisFormat();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
        <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Actual history (solid) followed by projections (dashed), clearly labelled.
 * `actual` and `projected` share the boundary point so the lines connect.
 */
export function ProjectionChart({ data, height = 280, series }: { data: Record<string, number | string | null>[]; height?: number; series: SeriesKey[] }) {
  const fmt = useAxisFormat();
  return (
    <div className="space-y-3">
      <Legend items={series} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={fmt.compact} domain={["auto", "auto"]} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip content={(p) => <ChartTooltip {...p} format={fmt.full} />} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "6 4" : undefined} dot={false} connectNulls={false} type="monotone" activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
