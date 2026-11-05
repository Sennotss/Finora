"use client";


export const AXIS = { stroke: "var(--grid)", tick: { fill: "var(--muted-foreground)", fontSize: 11 }, tickLine: false, axisLine: false } as const;

export type SeriesKey = { key: string; label: string; color: string; dashed?: boolean };

/** Shared tooltip: series swatches beside labels, values in text ink. */
type TooltipEntry = { dataKey?: unknown; name?: unknown; value?: unknown; color?: string; payload?: Record<string, unknown> };

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: { active?: boolean; payload?: ReadonlyArray<TooltipEntry>; label?: unknown; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== null && label !== "" && <p className="mb-1.5 font-medium text-popover-foreground">{String(label)}</p>}
      <ul className="space-y-1">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => (
            <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: (p.color as string) ?? (p.payload?.fill as string) }} aria-hidden />
                {String(p.name ?? "")}
              </span>
              <span className="tabular font-medium text-popover-foreground">{format(Number(p.value))}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function Legend({ items }: { items: SeriesKey[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-1.5">
          {i.dashed ? (
            <svg width="14" height="4" aria-hidden>
              <line x1="0" y1="2" x2="14" y2="2" stroke={i.color} strokeWidth="2" strokeDasharray="3 2" />
            </svg>
          ) : (
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
