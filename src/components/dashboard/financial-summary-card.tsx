import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Stat tile: label · value · optional delta/footnote. */
export function FinancialSummaryCard({
  label,
  value,
  icon: Icon,
  footer,
  hint,
  emphasis = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  footer?: React.ReactNode;
  hint?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("gap-2", className)}>
      <CardContent className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {Icon && <Icon className="size-3.5" aria-hidden />}
          <span>{label}</span>
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="ml-auto rounded text-muted-foreground/70 hover:text-foreground" aria-label={`About ${label}`}>
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className={cn("truncate font-semibold tracking-tight", emphasis ? "text-2xl" : "text-xl")}>{value}</div>
        {footer && <div className="min-h-4">{footer}</div>}
      </CardContent>
    </Card>
  );
}
