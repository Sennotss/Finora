import { isPeriodPreset, resolvePeriod, type PeriodPreset, type ResolvedPeriod } from "./dates";

/** Reads `period`/`from`/`to` search params into a resolved period. */
export function periodFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  today: Date,
  weekStartsOn: number,
  fallback: PeriodPreset = "this_month",
): ResolvedPeriod & { from?: string; to?: string } {
  const get = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const raw = get("period");
  const from = get("from");
  const to = get("to");
  const preset: PeriodPreset = isPeriodPreset(raw) ? raw : from && to ? "custom" : fallback;
  return { ...resolvePeriod(preset, today, { weekStartsOn, from, to }), from, to };
}
