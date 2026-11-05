import type Decimal from "decimal.js";
import { D, type MoneyLike } from "./money";

export const SUPPORTED_CURRENCIES = [
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "GBP", name: "British Pound" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "SAR", name: "Saudi Riyal" },
] as const;

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as unknown as readonly [string, ...string[]];

export type RateRecord = { fromCurrency: string; toCurrency: string; rate: MoneyLike; date: Date };

export type Converter = {
  baseCurrency: string;
  /** Convert to base currency. Returns null when no rate is known — callers must handle it explicitly. */
  toBase(amount: MoneyLike, currency: string): Decimal | null;
  rateFor(currency: string): Decimal | null;
};

/**
 * Builds a converter from user-maintained exchange rates. The most recent rate for each
 * currency pair is used (direct rate preferred, inverse accepted). Historical amounts
 * are converted with the latest rate; this is surfaced to users as an assumption.
 */
export function createConverter(baseCurrency: string, rates: RateRecord[]): Converter {
  const latest = new Map<string, Decimal>();
  const sorted = [...rates].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const r of sorted) {
    const rate = D(r.rate);
    if (rate.lessThanOrEqualTo(0)) continue;
    if (r.toCurrency === baseCurrency) latest.set(r.fromCurrency, rate);
  }
  // Inverse rates only fill gaps left by direct rates.
  for (const r of sorted) {
    const rate = D(r.rate);
    if (rate.lessThanOrEqualTo(0)) continue;
    if (r.fromCurrency === baseCurrency && !latestDirect(sorted, r.toCurrency, baseCurrency)) {
      latest.set(r.toCurrency, D(1).div(rate));
    }
  }

  const rateFor = (currency: string): Decimal | null => {
    if (currency === baseCurrency) return D(1);
    return latest.get(currency) ?? null;
  };

  return {
    baseCurrency,
    rateFor,
    toBase(amount, currency) {
      const rate = rateFor(currency);
      return rate ? D(amount).times(rate) : null;
    },
  };
}

function latestDirect(rates: RateRecord[], from: string, to: string) {
  return rates.some((r) => r.fromCurrency === from && r.toCurrency === to && D(r.rate).greaterThan(0));
}

/** Converter that only understands the base currency (useful in tests and fallbacks). */
export function identityConverter(baseCurrency: string): Converter {
  return createConverter(baseCurrency, []);
}
