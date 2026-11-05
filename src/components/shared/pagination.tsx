import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({ page, pageCount, total, pageSize, params, basePath }: { page: number; pageCount: number; total: number; pageSize: number; params: Record<string, string | undefined>; basePath: string }) {
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    if (p > 1) q.set("page", String(p));
    else q.delete("page");
    return `${basePath}?${q.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">
        <span className="tabular">{from}–{to}</span> of <span className="tabular">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild><Link href={href(page - 1)} aria-label="Previous page"><ChevronLeft /> Prev</Link></Button>
        ) : (
          <Button variant="outline" size="sm" disabled><ChevronLeft /> Prev</Button>
        )}
        <span className="tabular px-2 text-muted-foreground">{page} / {pageCount}</span>
        {page < pageCount ? (
          <Button variant="outline" size="sm" asChild><Link href={href(page + 1)} aria-label="Next page">Next <ChevronRight /></Link></Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Next <ChevronRight /></Button>
        )}
      </div>
    </nav>
  );
}
