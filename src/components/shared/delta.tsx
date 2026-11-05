import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type Decimal from "decimal.js";
import { cn } from "@/lib/utils";

/**
 * Signed change vs a named period. Colour encodes direction × whether "up" is good,
 * always alongside an arrow icon and text so it never relies on colour alone.
 */
export function Delta({ value, upIsGood = true, label, className }: { value: Decimal | null; upIsGood?: boolean; label?: string; className?: string }) {
  if (value === null) return <span className={cn("text-xs text-muted-foreground", className)}>No comparison data</span>;
  const rounded = value.toDecimalPlaces(1);
  const flat = rounded.isZero();
  const up = rounded.greaterThan(0);
  const good = flat ? null : up === upIsGood;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <span className={cn("inline-flex items-center gap-0.5 font-medium", good === true && "text-positive", good === false && "text-negative", good === null && "text-muted-foreground")}>
        <Icon className="size-3.5" aria-hidden />
        <span className="tabular">{flat ? "0%" : `${up ? "+" : ""}${rounded.toString()}%`}</span>
      </span>
      {label && <span className="text-muted-foreground">{label}</span>}
    </span>
  );
}
