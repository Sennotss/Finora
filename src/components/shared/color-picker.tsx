"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const SWATCHES = ["#2a78d6", "#1baf7a", "#eb6834", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#0ea5e9", "#64748b", "#8b5cf6", "#14b8a6"];

export function ColorPicker({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div id={id} role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring", value.toLowerCase() === c && "ring-2 ring-foreground/60")}
          style={{ backgroundColor: c }}
        >
          {value.toLowerCase() === c && <Check className="size-3.5 text-white" aria-hidden />}
        </button>
      ))}
    </div>
  );
}
