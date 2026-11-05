import { cn } from "@/lib/utils";
import { D, formatMoney, type MoneyLike } from "@/lib/money";

type Tone = "auto" | "income" | "expense" | "neutral";

/**
 * Formatted amount, server- and client-safe (no hooks).
 * - `tone="income"` shows a + sign (with `sign`) in the positive colour.
 * - `tone="expense"` shows a − sign (with `sign`) in the primary ink — expenses are normal,
 *   not alarming, so they are not painted red.
 * - `tone="auto"` picks income/expense from the value's sign.
 */
export function Money({
  value,
  currency,
  locale = "id-ID",
  tone = "neutral",
  sign = false,
  compact = false,
  className,
}: {
  value: MoneyLike;
  currency: string;
  locale?: string;
  tone?: Tone;
  sign?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const d = D(value);
  const resolved = tone === "auto" ? (d.isNegative() ? "expense" : d.isZero() ? "neutral" : "income") : tone;
  const magnitude = tone === "auto" ? d : d.abs();
  const display = resolved === "expense" && sign ? magnitude.abs().negated() : magnitude;
  return (
    <span className={cn("tabular whitespace-nowrap", resolved === "income" && "text-positive", className)}>
      {formatMoney(display, currency, { locale, compact, signDisplay: sign ? "exceptZero" : "auto" })}
    </span>
  );
}
