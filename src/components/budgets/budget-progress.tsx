import type Decimal from "decimal.js";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { BUDGET_STATUS_LABELS, type BudgetStatus } from "@/features/budgets/calculations";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<BudgetStatus, { bar: string; text: string; icon: typeof CheckCircle2 }> = {
  healthy: { bar: "bg-[var(--chart-1)]", text: "text-muted-foreground", icon: CheckCircle2 },
  normal: { bar: "bg-[var(--chart-1)]", text: "text-muted-foreground", icon: CheckCircle2 },
  moderate: { bar: "bg-[#eda100] dark:bg-[#c98500]", text: "text-warning", icon: CircleAlert },
  warning: { bar: "bg-[#ec835a]", text: "text-warning", icon: AlertTriangle },
  reached: { bar: "bg-[#d03b3b]", text: "text-negative", icon: AlertTriangle },
  exceeded: { bar: "bg-[#d03b3b]", text: "text-negative", icon: AlertTriangle },
};

/**
 * Meter for budget usage. The fill colour carries severity and is always paired with a
 * status icon and label; the track is a lighter step of the same hue.
 */
export function BudgetProgress({ percent, status, projectedPercent, compact = false, label }: { percent: Decimal | null; status: BudgetStatus; projectedPercent?: Decimal | null; compact?: boolean; label?: string }) {
  const pct = percent ? Math.max(0, percent.toNumber()) : 0;
  const projected = projectedPercent ? Math.min(100, Math.max(0, projectedPercent.toNumber())) : null;
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <div className="space-y-1.5">
      <div
        className="relative h-2 overflow-hidden rounded-full bg-primary/10"
        role="progressbar"
        aria-label={label ?? "Budget used"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(pct, 100))}
        aria-valuetext={`${pct.toFixed(0)}% used — ${BUDGET_STATUS_LABELS[status]}`}
      >
        {projected !== null && projected > pct && <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/10" style={{ width: `${projected}%` }} />}
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width]", style.bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {!compact && (
        <p className={cn("flex items-center gap-1 text-xs", style.text)}>
          <Icon className="size-3.5" aria-hidden />
          <span className="tabular">{pct.toFixed(0)}%</span> · {BUDGET_STATUS_LABELS[status]}
        </p>
      )}
    </div>
  );
}
