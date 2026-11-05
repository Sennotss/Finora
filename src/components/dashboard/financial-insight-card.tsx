import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, Lightbulb, TrendingUp } from "lucide-react";
import type { Insight } from "@/features/insights/insights";
import { cn } from "@/lib/utils";

const TONE = {
  positive: { icon: TrendingUp, cls: "text-positive", label: "Positive" },
  neutral: { icon: Lightbulb, cls: "text-primary", label: "Info" },
  warning: { icon: CircleAlert, cls: "text-warning", label: "Heads up" },
  negative: { icon: AlertTriangle, cls: "text-negative", label: "Attention" },
} as const;

export function FinancialInsightCard({ insight }: { insight: Insight }) {
  const tone = TONE[insight.tone];
  const content = (
    <div className="flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">
      <tone.icon className={cn("mt-0.5 size-4 shrink-0", tone.cls)} aria-label={tone.label} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{insight.title}</p>
        <p className="text-sm text-muted-foreground">{insight.message}</p>
      </div>
      {insight.href && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );
  return insight.href ? (
    <Link href={insight.href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      {content}
    </Link>
  ) : (
    content
  );
}
