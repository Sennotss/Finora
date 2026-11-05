"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type TableView = { columns: string[]; rows: (string | number)[][] };

/** Card wrapper for charts with an accessible "view as table" alternative. */
export function ChartCard({
  title,
  description,
  action,
  table,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  table?: TableView;
  className?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {(action || table) && (
          <CardAction className="flex items-center gap-1">
            {action}
            {table && (
              <Button variant="ghost" size="icon-sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} aria-label={showTable ? "Show chart" : "Show data table"}>
                {showTable ? <BarChart3 /> : <Table2 />}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {showTable && table ? (
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((c, i) => (
                    <TableHead key={c} className={cn(i > 0 && "text-right")}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((r, i) => (
                  <TableRow key={i}>
                    {r.map((cell, j) => (
                      <TableCell key={j} className={cn("tabular", j > 0 && "text-right")}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
