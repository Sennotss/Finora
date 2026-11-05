"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, LoaderCircle, Undo2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { IMPORT_FIELDS, DATE_FORMATS, type ColumnMapping, type ImportOptions, type ValidatedRow } from "@/features/import/parse";
import { cn } from "@/lib/utils";
import type { AccountOption } from "./types";

type Parsed = { headers: string[]; rows: string[][]; fileName: string; mapping: ColumnMapping };
type Preview = { rows: ValidatedRow[]; summary: { total: number; valid: number; duplicates: number; invalid: number } };
type Report = { imported: number; skippedInvalid: { rowNumber: number; errors: string[] }[]; skippedDuplicates: number[] };
type Batch = { id: string; fileName: string; createdAt: string; importedRows: number; remaining: number };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export function ImportWizard({ accounts, batches }: { accounts: AccountOption[]; batches: Batch[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>({ dateFormat: "YYYY-MM-DD", decimalSeparator: ".", defaultAccountId: accounts[0]?.id ?? null, unknownCategory: "error" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<"all" | "valid" | "duplicate" | "invalid">("all");

  async function onFile(file: File) {
    setBusy("Reading file…");
    setPreview(null);
    setReport(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/transactions/import/parse", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the file");
      setParsed(data);
      setMapping(data.mapping);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const payload = () => ({ fileName: parsed!.fileName, rows: parsed!.rows, mapping, options });

  async function runPreview() {
    setBusy("Validating rows…");
    try {
      setPreview(await postJson<Preview>("/api/transactions/import/preview", payload()));
      setFilter("all");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy("Importing…");
    try {
      const r = await postJson<Report>("/api/transactions/import/commit", { ...payload(), includeDuplicates });
      setReport(r);
      setPreview(null);
      setParsed(null);
      toast.success(`${r.imported} transaction${r.imported === 1 ? "" : "s"} imported`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function undo(batch: Batch) {
    const res = await fetch(`/api/transactions/import/batches/${batch.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`${data.removed} transactions removed`);
      router.refresh();
    } else toast.error(data.error ?? "Could not undo the import");
  }

  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === undefined);
  const visibleRows = preview?.rows.filter((r) => filter === "all" || r.status === filter) ?? [];
  const importCount = preview ? preview.summary.valid + (includeDuplicates ? preview.summary.duplicates : 0) : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload a file</CardTitle>
          <CardDescription>CSV or Excel (.xlsx), up to 4 MB and 5,000 rows. The first row must contain column headers.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Choose file to import" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            <Upload /> Choose file
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/transactions/import/template?format=csv" download><Download /> CSV template</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/transactions/import/template?format=xlsx" download><FileSpreadsheet /> Excel template</a>
          </Button>
          {parsed && <span className="text-sm text-muted-foreground">{parsed.fileName} · {parsed.rows.length} rows</span>}
          {busy && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> {busy}</span>}
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle>2. Map columns and options</CardTitle>
            <CardDescription>We guessed the mapping from your headers — check it before previewing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`map-${f.key}`}>
                    {f.label}
                    {f.required && <span className="text-muted-foreground"> *</span>}
                  </Label>
                  <Select
                    value={mapping[f.key] === undefined ? "none" : String(mapping[f.key])}
                    onValueChange={(v) => {
                      setPreview(null);
                      setMapping((m) => {
                        const next = { ...m };
                        if (v === "none") delete next[f.key];
                        else next[f.key] = Number(v);
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger id={`map-${f.key}`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not mapped —</SelectItem>
                      {parsed.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="opt-date">Date format</Label>
                <Select value={options.dateFormat} onValueChange={(v) => { setPreview(null); setOptions((o) => ({ ...o, dateFormat: v as ImportOptions["dateFormat"] })); }}>
                  <SelectTrigger id="opt-date" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{DATE_FORMATS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opt-dec">Decimal separator</Label>
                <Select value={options.decimalSeparator} onValueChange={(v) => { setPreview(null); setOptions((o) => ({ ...o, decimalSeparator: v as "." | "," })); }}>
                  <SelectTrigger id="opt-dec" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".">Dot — 1,500.50</SelectItem>
                    <SelectItem value=",">Comma — 1.500,50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opt-acc">Default account</Label>
                <Select value={options.defaultAccountId ?? "none"} onValueChange={(v) => { setPreview(null); setOptions((o) => ({ ...o, defaultAccountId: v === "none" ? null : v })); }}>
                  <SelectTrigger id="opt-acc" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (account column required)</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opt-cat">Unknown categories</Label>
                <Select value={options.unknownCategory} onValueChange={(v) => { setPreview(null); setOptions((o) => ({ ...o, unknownCategory: v as ImportOptions["unknownCategory"] })); }}>
                  <SelectTrigger id="opt-cat" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error">Mark row invalid</SelectItem>
                    <SelectItem value="uncategorized">Import as uncategorised</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={runPreview} disabled={busy !== null || missingRequired.length > 0}>Preview rows</Button>
              {missingRequired.length > 0 && <span className="text-sm text-negative">Map: {missingRequired.map((f) => f.label).join(", ")}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>3. Review and import</CardTitle>
            <CardDescription>Only valid rows are imported. Duplicates are skipped unless you include them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter preview rows">
              {([
                ["all", `All ${preview.summary.total}`, null],
                ["valid", `Valid ${preview.summary.valid}`, CheckCircle2],
                ["duplicate", `Duplicates ${preview.summary.duplicates}`, Copy],
                ["invalid", `Invalid ${preview.summary.invalid}`, XCircle],
              ] as const).map(([key, label, Icon]) => (
                <Button key={key} size="sm" variant={filter === key ? "secondary" : "ghost"} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>
                  {Icon && <Icon />} {label}
                </Button>
              ))}
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.slice(0, 500).map((r) => (
                    <TableRow key={r.rowNumber} className={cn(r.status === "invalid" && "bg-destructive/5")}>
                      <TableCell className="tabular text-muted-foreground">{r.rowNumber}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "invalid" ? "destructive" : r.status === "duplicate" ? "secondary" : "outline"}>
                          {r.status === "valid" ? "Valid" : r.status === "duplicate" ? "Duplicate" : "Invalid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap">{r.display.date}</TableCell>
                      <TableCell>{r.display.type}</TableCell>
                      <TableCell className="max-w-56 truncate">{r.display.description}</TableCell>
                      <TableCell>{r.display.account}</TableCell>
                      <TableCell className="tabular text-right">{r.display.amount}</TableCell>
                      <TableCell className="min-w-56 text-xs">
                        {r.errors.map((e) => <p key={e} className="flex gap-1 text-negative"><XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />{e}</p>)}
                        {r.warnings.map((w) => <p key={w} className="flex gap-1 text-muted-foreground"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />{w}</p>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {visibleRows.length > 500 && <p className="text-xs text-muted-foreground">Showing the first 500 rows of this filter.</p>}
            <div className="flex flex-wrap items-center gap-4">
              {preview.summary.duplicates > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={includeDuplicates} onCheckedChange={(v) => setIncludeDuplicates(Boolean(v))} />
                  Import duplicates too
                </label>
              )}
              <Button onClick={commit} disabled={busy !== null || importCount === 0} className="ml-auto">
                Import {importCount} row{importCount === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-positive" aria-hidden /> Import complete</CardTitle>
            <CardDescription>
              {report.imported} imported · {report.skippedInvalid.length} invalid skipped · {report.skippedDuplicates.length} duplicates skipped
            </CardDescription>
          </CardHeader>
          {report.skippedInvalid.length > 0 && (
            <CardContent>
              <p className="mb-2 text-sm font-medium">Rows not imported</p>
              <ul className="max-h-60 space-y-1 overflow-auto text-sm">
                {report.skippedInvalid.map((r) => (
                  <li key={r.rowNumber}><span className="tabular text-muted-foreground">Row {r.rowNumber}:</span> {r.errors.join("; ")}</li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
            <CardDescription>Undo removes the transactions an import created (they can still be restored individually).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.fileName}</span>
                    <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()} · {b.importedRows} imported · {b.remaining} still active</span>
                  </span>
                  <ConfirmationDialog
                    trigger={<Button variant="ghost" size="sm" disabled={b.remaining === 0}><Undo2 /> Undo</Button>}
                    title="Undo this import?"
                    description={`${b.remaining} transactions from "${b.fileName}" will be deleted.`}
                    confirmLabel="Undo import"
                    destructive
                    onConfirm={() => undo(b)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
