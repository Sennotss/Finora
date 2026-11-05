"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/features/transactions/schemas";
import type { PeriodPreset } from "@/lib/dates";
import { groupCategories, type AccountOption, type CategoryOption } from "./types";

const FILTER_KEYS = ["q", "type", "account", "category", "method", "tag", "period", "from", "to", "sort"] as const;

export function TransactionFilters({
  accounts,
  categories,
  tags,
  period,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  tags: { id: string; name: string }[];
  period: { preset: PeriodPreset | null; label: string; from?: string; to?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // Debounced search.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const h = setTimeout(() => update("q", q.trim() || null), 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = FILTER_KEYS.some((k) => params.get(k));
  const selectCls = "h-9 w-full sm:w-auto sm:min-w-36";

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="relative lg:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, merchant, notes" className="h-9 pl-8" aria-label="Search transactions" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select value={params.get("type") ?? "all"} onValueChange={(v) => update("type", v)}>
          <SelectTrigger className={selectCls} aria-label="Filter by type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={params.get("account") ?? "all"} onValueChange={(v) => update("account", v)}>
          <SelectTrigger className={selectCls} aria-label="Filter by account"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.get("category") ?? "all"} onValueChange={(v) => update("category", v)}>
          <SelectTrigger className={selectCls} aria-label="Filter by category"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorised</SelectItem>
            {(["EXPENSE", "INCOME"] as const).map((kind) => (
              <SelectGroup key={kind}>
                <SelectSeparator />
                <SelectLabel>{kind === "EXPENSE" ? "Expense" : "Income"}</SelectLabel>
                {groupCategories(categories, kind).flatMap(({ parent, children }) => [
                  <SelectItem key={parent.id} value={parent.id}>{parent.name}</SelectItem>,
                  ...children.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="pl-7">{c.name}</SelectItem>
                  )),
                ])}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.get("method") ?? "all"} onValueChange={(v) => update("method", v)}>
          <SelectTrigger className={selectCls} aria-label="Filter by payment method"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tags.length > 0 && (
          <Select value={params.get("tag") ?? "all"} onValueChange={(v) => update("tag", v)}>
            <SelectTrigger className={selectCls} aria-label="Filter by tag"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>#{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={params.get("sort") ?? "date_desc"} onValueChange={(v) => update("sort", v === "date_desc" ? null : v)}>
          <SelectTrigger className={selectCls} aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="amount_desc">Largest amount</SelectItem>
            <SelectItem value="amount_asc">Smallest amount</SelectItem>
            <SelectItem value="created_desc">Recently added</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter current={period.preset ?? "custom"} label={period.preset ? period.label : "All dates"} from={period.from} to={period.to} />
      </div>
      {active && (
        <Button variant="ghost" size="sm" className="self-start lg:self-auto" onClick={() => { setQ(""); router.push(pathname); }}>
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
