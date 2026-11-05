"use client";

import { createContext, useContext, useMemo } from "react";
import { formatMoney, formatPercent, type MoneyLike } from "@/lib/money";

type FormatSettings = { currency: string; locale: string };

const FormatContext = createContext<FormatSettings>({ currency: "IDR", locale: "id-ID" });

export function FormatProvider({ currency, locale, children }: FormatSettings & { children: React.ReactNode }) {
  const value = useMemo(() => ({ currency, locale }), [currency, locale]);
  return <FormatContext value={value}>{children}</FormatContext>;
}

export function useFormat() {
  const { currency, locale } = useContext(FormatContext);
  return useMemo(
    () => ({
      currency,
      locale,
      money: (v: MoneyLike, opts: { currency?: string; compact?: boolean; signDisplay?: "auto" | "always" | "exceptZero" } = {}) =>
        formatMoney(v, opts.currency ?? currency, { locale, compact: opts.compact, signDisplay: opts.signDisplay }),
      percent: (v: MoneyLike | null, decimals = 1) => formatPercent(v, { locale, decimals }),
    }),
    [currency, locale],
  );
}
