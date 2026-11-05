"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/dates";
import { cn } from "@/lib/utils";

const DEFAULT_PRESETS: PeriodPreset[] = ["today", "this_week", "this_month", "last_month", "last_3_months", "last_6_months", "this_year", "last_12_months"];

/** Period selector that writes `period`, `from` and `to` to the URL so server data follows. */
export function DateRangeFilter({ current, label, from, to, presets = DEFAULT_PRESETS }: { current: PeriodPreset; label: string; from?: string; to?: string; presets?: PeriodPreset[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  function apply(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
    setOpen(false);
  }

  const customValid = Boolean(customFrom && customTo);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 gap-2" aria-label={`Date range: ${label}`}>
          <CalendarDays className="text-muted-foreground" aria-hidden />
          <span className="max-w-48 truncate">{label}</span>
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <ul role="listbox" aria-label="Date range presets" className="py-1">
          {presets.map((p) => (
            <li key={p}>
              <button
                type="button"
                role="option"
                aria-selected={current === p}
                onClick={() => apply({ period: p, from: null, to: null })}
                className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", current === p && "font-medium")}
              >
                {PERIOD_LABELS[p]}
                {current === p && <Check className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t p-2.5">
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-xs">From</Label>
              <Input id="range-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 px-2 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-xs">To</Label>
              <Input id="range-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 px-2 text-xs" />
            </div>
          </div>
          <Button size="sm" className="w-full" disabled={!customValid} onClick={() => apply({ period: "custom", from: customFrom, to: customTo })}>
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
