import type Decimal from "decimal.js";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Money } from "@/components/shared/money";
import { formatDisplayDate } from "@/lib/dates";
import type { GoalProgress } from "@/features/goals/calculations";

export function GoalProgressSummary({ name, color, progress, currency, locale, targetDate }: { name: string; color: string; progress: GoalProgress; currency: string; locale: string; targetDate: string | null; targetAmount?: Decimal }) {
  const pct = Math.min(100, progress.percent.toNumber());
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{name}</span>
        <span className="tabular text-xs text-muted-foreground">{progress.percent.toDecimalPlaces(0).toString()}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label={`${name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
        <span>
          <Money value={progress.current} currency={currency} locale={locale} /> of <Money value={progress.target} currency={currency} locale={locale} />
        </span>
        {progress.isCompleted ? (
          <span className="flex items-center gap-1 text-positive"><CheckCircle2 className="size-3.5" aria-hidden /> Completed</span>
        ) : progress.isOverdue ? (
          <span className="flex items-center gap-1 text-negative"><AlertTriangle className="size-3.5" aria-hidden /> Overdue</span>
        ) : targetDate ? (
          <span className="flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden /> {formatDisplayDate(targetDate)}</span>
        ) : null}
      </div>
    </div>
  );
}
