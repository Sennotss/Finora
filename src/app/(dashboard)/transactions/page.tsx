import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftRight, Download, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Money } from "@/components/shared/money";
import { QuickAddButton } from "@/components/transactions/quick-add-dialog";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { requireUserContext } from "@/lib/dal";
import { db } from "@/lib/db";
import { formatDateOnly, isPeriodPreset, PERIOD_LABELS, formatRangeLabel } from "@/lib/dates";
import { listActiveAccounts } from "@/features/accounts/service";
import { listCategories } from "@/features/categories/service";
import { filterDateRange, listTransactions, parseFilters } from "@/features/transactions/service";
import { toTransactionRow } from "@/features/transactions/serialize";
import { cashFlowTotals } from "@/features/analytics/calculations";
import { D } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/transactions">["searchParams"] }) {
  const { user, ctx } = await requireUserContext();
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const [result, activeAccounts, allAccounts, categories, tags] = await Promise.all([
    listTransactions(user.id, filters),
    listActiveAccounts(user.id),
    db.account.findMany({ where: { userId: user.id }, select: { id: true, name: true, type: true, currency: true, color: true, icon: true }, orderBy: { name: "asc" } }),
    listCategories(user.id),
    db.tag.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const rows = result.items.map(toTransactionRow);
  const range = filterDateRange(filters, ctx.today, ctx.weekStartsOn);
  const preset = filters.from || filters.to ? "custom" : filters.period && isPeriodPreset(filters.period) ? filters.period : null;
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([k, v]) => v !== undefined && !["page", "pageSize"].includes(k)).map(([k, v]) => [k, String(v)]));
  const deletedView = filters.view === "deleted";
  const pageTotals = cashFlowTotals(
    result.items.map((t) => ({ ...t, amount: D(t.amount), destinationAmount: null, isScheduled: false })),
    ctx.converter,
  );
  const hasAnyFilter = Boolean(filters.q || filters.type || filters.account || filters.category || filters.method || filters.tag || range);

  return (
    <div className="space-y-5">
      <PageHeader
        title={deletedView ? "Recently deleted" : "Transactions"}
        description={deletedView ? "Deleted transactions are excluded from every calculation. Restore them if needed." : "Search, filter and manage every income, expense and transfer."}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={deletedView ? "/transactions" : "/transactions?view=deleted"}>
                {deletedView ? <><ArrowLeftRight /> All transactions</> : <><Trash2 /> Recently deleted</>}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/transactions/import"><Upload /> Import</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/transactions/export?format=csv&${exportQuery}`} download><FileSpreadsheet /> CSV (current filters)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/transactions/export?format=xlsx&${exportQuery}`} download><FileSpreadsheet /> Excel (current filters)</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!deletedView && <QuickAddButton />}
          </>
        }
      />

      <TransactionFilters
        accounts={allAccounts}
        categories={categories}
        tags={tags}
        period={{ preset, label: preset === "custom" && range ? formatRangeLabel(range) : preset ? PERIOD_LABELS[preset] : "All dates", from: filters.from, to: filters.to }}
      />

      {rows.length > 0 && !deletedView && (
        <p className="text-xs text-muted-foreground">
          This page: income <Money value={pageTotals.income} currency={ctx.baseCurrency} locale={ctx.locale} /> · expenses <Money value={pageTotals.expense} currency={ctx.baseCurrency} locale={ctx.locale} /> (transfers excluded)
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ArrowLeftRight}
              title={hasAnyFilter ? "No transactions match these filters" : deletedView ? "Nothing here" : "No transactions yet"}
              description={hasAnyFilter ? "Try widening the date range or clearing filters." : deletedView ? "Deleted transactions will appear here." : "Add your first transaction or import a CSV/Excel file."}
              action={!hasAnyFilter && !deletedView ? <QuickAddButton /> : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <TransactionTable rows={rows} accounts={activeAccounts} categories={categories} locale={ctx.locale} today={formatDateOnly(ctx.today)} deletedView={deletedView} />
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} basePath="/transactions" params={Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))} />
        </>
      )}
    </div>
  );
}
