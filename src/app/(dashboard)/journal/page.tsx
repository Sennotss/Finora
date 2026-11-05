import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryMenu, MonthlyReviewForm, MOODS, NewEntryButton, ReviewMonthPicker } from "@/components/journal/journal-components";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserContext } from "@/lib/dal";
import { addMonths, endOfMonth, formatDateOnly, formatDisplayDate, formatMonth, monthKey, parseDateOnly, startOfMonth } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { cashFlowTotals, categoryBreakdown } from "@/features/analytics/calculations";
import { loadCategories, loadLedger } from "@/features/finance/repository";
import { JOURNAL_TYPES, JOURNAL_TYPE_LABELS } from "@/features/journal/schemas";
import { getMonthlyReview, listJournal } from "@/features/journal/service";

export const metadata: Metadata = { title: "Financial Journal" };

export default function JournalPage({ searchParams }: PageProps<"/journal">) {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" />}>
      <Journal searchParams={searchParams} />
    </Suspense>
  );
}

async function Journal({ searchParams }: { searchParams: PageProps<"/journal">["searchParams"] }) {
  const { user, ctx } = await requireUserContext();
  const raw = await searchParams;
  const get = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined));
  const type = JOURNAL_TYPES.includes(get("type") as never) || get("type") === "MONTHLY_REVIEW" ? get("type") : undefined;

  // Default review month: last month during the first week, otherwise this month.
  const defaultMonth = ctx.today.getUTCDate() <= 7 ? monthKey(addMonths(ctx.today, -1, 1)) : monthKey(ctx.today);
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = addMonths(startOfMonth(ctx.today), -i, 1);
    return { value: monthKey(d), label: formatMonth(d, true) };
  });
  const month = monthOptions.some((o) => o.value === get("month")) ? get("month")! : defaultMonth;
  const monthStart = parseDateOnly(`${month}-01`);
  const range = { start: monthStart, end: endOfMonth(monthStart) };

  const [entries, review, txs, categories] = await Promise.all([listJournal(user.id, { type }), getMonthlyReview(user.id, month), loadLedger(user.id, range), loadCategories(user.id)]);
  const totals = cashFlowTotals(txs, ctx.converter);
  const top = categoryBreakdown(txs, categories, ctx.converter)[0];
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, ctx.baseCurrency, { locale: ctx.locale });
  const today = formatDateOnly(ctx.today);

  return (
    <div className="space-y-6">
      <PageHeader title="Financial journal" description="Reflect on decisions, lessons and priorities. Writing things down builds better money habits." actions={<NewEntryButton today={today} />} />
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Monthly review</CardTitle>
            <CardDescription>{review ? `Last saved ${review.updatedAt.toLocaleDateString()}` : "Not written yet"}</CardDescription>
            <CardAction><ReviewMonthPicker value={month} options={monthOptions} /></CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Income</dt><dd className="tabular font-medium">{money(totals.income)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Expenses</dt><dd className="tabular font-medium">{money(totals.expense)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Net</dt><dd className="tabular font-medium">{money(totals.net)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Saving rate</dt><dd className="tabular font-medium">{formatPercent(totals.savingRate, { locale: ctx.locale })}</dd></div>
              {top && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Largest category</dt><dd>{top.name} · {money(top.amount)}</dd></div>}
            </dl>
            <MonthlyReviewForm
              key={month}
              initial={{ reviewMonth: month, wentWell: review?.wentWell ?? "", toImprove: review?.toImprove ?? "", nextPriorities: review?.nextPriorities ?? "", content: review?.content ?? "", mood: review?.mood ?? null }}
            />
          </CardContent>
        </Card>
        <div className="space-y-3 xl:col-span-3">
          <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Filter entries">
            <Button size="sm" variant={!type ? "secondary" : "ghost"} asChild><Link href="/journal">All</Link></Button>
            {[...JOURNAL_TYPES, "MONTHLY_REVIEW" as const].map((t) => (
              <Button key={t} size="sm" variant={type === t ? "secondary" : "ghost"} asChild><Link href={`/journal?type=${t}`}>{JOURNAL_TYPE_LABELS[t]}</Link></Button>
            ))}
          </div>
          {entries.length === 0 ? (
            <Card><CardContent><EmptyState icon={BookOpen} title="No entries yet" description="Try writing about a recent purchase decision, or what you want to prioritise next month." /></CardContent></Card>
          ) : (
            entries.map((e) => (
              <Card key={e.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {e.title}
                    <Badge variant="outline" className="font-normal">{JOURNAL_TYPE_LABELS[e.type]}</Badge>
                    {e.mood && <span className="text-sm font-normal text-muted-foreground">{MOODS[e.mood]}</span>}
                  </CardTitle>
                  <CardDescription>
                    {formatDisplayDate(e.entryDate)}
                    {e.amount && ` · ${money(e.amount)}`}
                  </CardDescription>
                  <CardAction>
                    <EntryMenu entryId={e.id} title={e.title} editable={e.type !== "MONTHLY_REVIEW"} today={today} initial={{ type: e.type === "MONTHLY_REVIEW" ? "REFLECTION" : e.type, title: e.title, content: e.content, entryDate: formatDateOnly(e.entryDate), mood: e.mood, amount: e.amount?.toString() ?? "" }} />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {e.type === "MONTHLY_REVIEW" ? (
                    <>
                      {e.wentWell && <p><span className="font-medium">Went well:</span> <span className="whitespace-pre-wrap text-muted-foreground">{e.wentWell}</span></p>}
                      {e.toImprove && <p><span className="font-medium">To improve:</span> <span className="whitespace-pre-wrap text-muted-foreground">{e.toImprove}</span></p>}
                      {e.nextPriorities && <p><span className="font-medium">Next priorities:</span> <span className="whitespace-pre-wrap text-muted-foreground">{e.nextPriorities}</span></p>}
                      {e.content && <p className="whitespace-pre-wrap text-muted-foreground">{e.content}</p>}
                    </>
                  ) : (
                    <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{e.content}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
