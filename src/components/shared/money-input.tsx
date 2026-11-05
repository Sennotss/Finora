"use client";

import { forwardRef, useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { currencyDecimals, localeSeparators, normalizeAmountInput } from "@/lib/money";

/**
 * Amount input that shows grouping separators for the user's locale while exposing a
 * canonical decimal string ("1500000.5") through `onChange` — no floats involved.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    id?: string;
    value: string | null | undefined;
    onChange: (value: string) => void;
    onBlur?: () => void;
    currency: string;
    locale: string;
    allowNegative?: boolean;
    placeholder?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    disabled?: boolean;
    autoFocus?: boolean;
  }
>(function MoneyInput({ value, onChange, currency, locale, allowNegative = false, ...props }, ref) {
  const { group, decimal } = localeSeparators(locale);
  const decimals = currencyDecimals(currency);
  const format = (canonical: string | null | undefined) => {
    if (!canonical) return "";
    const negative = canonical.startsWith("-");
    const [int, frac] = canonical.replace("-", "").split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
    return `${negative ? "-" : ""}${grouped}${frac !== undefined ? decimal + frac : ""}`;
  };
  const [text, setText] = useState(format(value));

  // Keep the display in sync when the form value is reset from outside.
  useEffect(() => {
    if (normalizeAmountInput(text, locale) !== (value || null)) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(raw: string) {
    const allowed = new RegExp(`[^0-9${escape(group)}${escape(decimal)}${allowNegative ? "-" : ""}]`, "g");
    let cleaned = raw.replace(allowed, "");
    if (decimals === 0) cleaned = cleaned.split(decimal)[0];
    const [intPart, ...rest] = cleaned.split(decimal);
    const frac = rest.join("").slice(0, Math.max(decimals, 4));
    const hasDecimal = cleaned.includes(decimal) && decimals > 0;
    const canonical = normalizeAmountInput(`${intPart}${hasDecimal ? decimal + frac : ""}`, locale) ?? "";
    const intFormatted = format(normalizeAmountInput(intPart, locale) ?? (intPart.startsWith("-") ? "-" : ""));
    setText(hasDecimal ? `${intFormatted}${decimal}${frac}` : intFormatted);
    onChange(canonical);
  }

  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText className="text-xs font-medium">{currency}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        ref={ref}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        className="tabular"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        {...props}
      />
    </InputGroup>
  );
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}
