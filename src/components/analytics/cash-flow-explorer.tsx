"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartCard } from "@/components/charts/chart-card";
import { IncomeExpenseChart, type CashFlowPoint } from "@/components/charts/charts";
import { useFormat } from "@/components/shared/format-context";

type Granularity = "day" | "week" | "month" | "year";
const LABELS: Record<Granularity, string> = { day: "Daily", week: "Weekly", month: "Monthly", year: "Annual" };

export function CashFlowExplorer({ series, initial }: { series: Record<Granularity, CashFlowPoint[]>; initial: Granularity }) {
  const [g, setG] = useState<Granularity>(initial);
  const f = useFormat();
  const data = series[g];
  return (
    <ChartCard
      title="Cash flow"
      description={g === "year" ? "Annual totals, last two years" : `${LABELS[g]} income, expenses and net for the selected period`}
      action={
        <ToggleGroup type="single" size="sm" variant="outline" value={g} onValueChange={(v) => v && setG(v as Granularity)} aria-label="Granularity">
          {(Object.keys(LABELS) as Granularity[]).map((k) => (
            <ToggleGroupItem key={k} value={k} className="px-2.5 text-xs">{LABELS[k]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      table={{ columns: ["Period", "Income", "Expenses", "Net"], rows: data.map((d) => [d.label, f.money(d.income), f.money(d.expense), f.money(d.net)]) }}
    >
      <IncomeExpenseChart data={data} height={300} />
    </ChartCard>
  );
}
