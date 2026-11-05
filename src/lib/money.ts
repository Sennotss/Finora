import Decimal from "decimal.js";

// Dedicated decimal constructor so app-wide settings never leak into other libraries.
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export type Money = Decimal;

export type MoneyLike = Decimal.Value | { toString(): string } | null | undefined;

/** Convert any numeric-ish value (Prisma Decimal, string, number, null) to a Decimal. */
export function D(value: MoneyLike): Decimal {
  if (value === null || value === undefined || value === "") return new Money(0);
  if (value instanceof Money) return value;
  if (typeof value === "number" || typeof value === "string") return new Money(value);
  // Prisma's Decimal comes from a separately bundled decimal.js; go via string for exactness.
  return new Money(value.toString());
}

export const ZERO = new Money(0);

export function sum(values: Iterable<MoneyLike>): Decimal {
  let total = new Money(0);
  for (const v of values) total = total.plus(D(v));
  return total;
}

/** Percentage (0–100 scale) or null when the denominator is zero. */
export function percentOf(part: MoneyLike, whole: MoneyLike): Decimal | null {
  const w = D(whole);
  if (w.isZero()) return null;
  return D(part).div(w).times(100);
}

/** Relative change in percent from `previous` to `current`; null if previous is zero. */
export function percentChange(current: MoneyLike, previous: MoneyLike): Decimal | null {
  const p = D(previous);
  if (p.isZero()) return null;
  return D(current).minus(p).div(p.abs()).times(100);
}

export function maxD(a: Decimal, b: Decimal): Decimal {
  return a.greaterThan(b) ? a : b;
}

export function minD(a: Decimal, b: Decimal): Decimal {
  return a.lessThan(b) ? a : b;
}

export function clampD(value: Decimal, min: MoneyLike, max: MoneyLike): Decimal {
  return minD(maxD(value, D(min)), D(max));
}

const ZERO_DECIMAL_CURRENCIES = new Set(["IDR", "JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX"]);

/** Number of minor-unit digits shown for a currency. IDR is displayed without decimals. */
export function currencyDecimals(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) return 0;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function roundMoney(value: MoneyLike, currency: string): Decimal {
  return D(value).toDecimalPlaces(currencyDecimals(currency), Decimal.ROUND_HALF_EVEN);
}

/** Serialise for transport to client components (exact, no float conversion). */
export function toMoneyString(value: MoneyLike): string {
  return D(value).toFixed();
}

type FormatOptions = {
  locale?: string;
  compact?: boolean;
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
  decimals?: number;
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(key: string, factory: () => Intl.NumberFormat) {
  let f = formatterCache.get(key);
  if (!f) {
    f = factory();
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(value: MoneyLike, currency: string, options: FormatOptions = {}): string {
  const { locale = "id-ID", compact = false, signDisplay = "auto" } = options;
  const decimals = options.decimals ?? currencyDecimals(currency);
  const key = `${locale}|${currency}|${compact}|${signDisplay}|${decimals}`;
  const formatter = getFormatter(key, () =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      signDisplay,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: compact ? 0 : decimals,
      maximumFractionDigits: compact ? 1 : decimals,
    }),
  );
  const rounded = D(value).toDecimalPlaces(compact ? 1 : decimals, Decimal.ROUND_HALF_EVEN);
  // Intl accepts decimal strings, which keeps formatting exact for large amounts.
  return formatter.format(rounded.toFixed() as unknown as number);
}

export function formatPercent(value: MoneyLike | null, options: { locale?: string; decimals?: number; signDisplay?: "auto" | "always" | "exceptZero" } = {}): string {
  if (value === null || value === undefined) return "—";
  const { locale = "id-ID", decimals = 1, signDisplay = "auto" } = options;
  const formatter = getFormatter(`pct|${locale}|${decimals}|${signDisplay}`, () =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: decimals, minimumFractionDigits: 0, signDisplay }),
  );
  return formatter.format(D(value).div(100).toFixed() as unknown as number);
}

export function formatNumber(value: MoneyLike, options: { locale?: string; decimals?: number } = {}): string {
  const { locale = "id-ID", decimals = 0 } = options;
  const formatter = getFormatter(`num|${locale}|${decimals}`, () =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, minimumFractionDigits: 0 }),
  );
  return formatter.format(D(value).toDecimalPlaces(decimals).toFixed() as unknown as number);
}

/** Separators used by a locale, e.g. id-ID → { group: ".", decimal: "," }. */
export function localeSeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
  };
}

/**
 * Normalise user-typed amounts ("1.500.000", "1,500,000.50", "Rp 25.000") into a
 * canonical decimal string ("1500000", "1500000.50"). Returns null when unparsable.
 */
export function normalizeAmountInput(raw: string, locale = "id-ID"): string | null {
  const { group, decimal } = localeSeparators(locale);
  let s = raw.trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  s = s.split(group).join("");
  if (decimal !== ".") s = s.replace(decimal, ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const normalized = new Money(s).toFixed();
  return negative ? `-${normalized}` : normalized;
}

export { Decimal };
