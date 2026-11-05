import type { HealthScore } from "@/features/analytics/health-score";
import { cn } from "@/lib/utils";

function Ring({ score }: { score: number | null }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  return (
    <svg viewBox="0 0 100 100" className="size-28 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--chart-1)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
    </svg>
  );
}

/** Score with a transparent per-indicator breakdown. */
export function FinancialHealthScore({ health, detailed = false }: { health: HealthScore; detailed?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Ring score={health.score} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold">{health.score ?? "—"}</span>
            <span className="text-[10px] text-muted-foreground">of 100</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-medium">{health.grade}</p>
          <p className="text-xs text-muted-foreground">
            {health.score === null
              ? "Add a few months of transactions to calculate a score."
              : `Based on ${health.components.filter((c) => c.points !== null).length} of ${health.components.length} indicators.`}
          </p>
        </div>
      </div>
      <ul className="space-y-3">
        {health.components.map((c) => (
          <li key={c.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{c.label}</span>
              <span className="tabular text-xs text-muted-foreground">{c.points === null ? "n/a" : `${c.points} / ${c.weight}`}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-primary/10" aria-hidden>
              <div className={cn("h-full rounded-full bg-[var(--chart-1)]")} style={{ width: `${c.points === null ? 0 : (c.points / c.weight) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{c.valueLabel}</p>
            {detailed && (
              <div className="space-y-0.5 pt-0.5 text-xs">
                <p className="text-muted-foreground">How it&apos;s scored: {c.rule}</p>
                {(c.points === null || c.points < c.weight) && <p>Tip: {c.tip}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This score is a simple educational heuristic based on your recorded data. It is not a professional financial assessment.
      </p>
    </div>
  );
}
