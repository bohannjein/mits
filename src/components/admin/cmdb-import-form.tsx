"use client";

import {
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { importCMDBAction } from "@/app/admin/cmdb/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AS_ATTRIBUTE,
  ATTRIBUTE_PREFIX,
  CI_IMPORT_TARGETS,
  IGNORE_COLUMN,
  guessColumnMapping,
  mappingForSubmit,
  parseDelimited,
  type DelimitedTable,
} from "@/lib/csv";

/* ──────────────────────────────────────────────────────────────────────────
   CSV / OTRS import with column mapping.

   Parsed twice on purpose: here to show the headers and a preview, and again on the
   server from the same raw text. The client's rows are never sent — a preview is a
   convenience, and trusting it would mean the import reads whatever the browser felt
   like posting.

   The mapping is guessed from the header names and then corrected by hand. Guessing
   without showing the guess would be the worst version of this: an import that silently
   put serial numbers in the model column.
   ────────────────────────────────────────────────────────────────────────── */

export function CMDBImportForm() {
  const [text, setText] = useState("");
  const [table, setTable] = useState<DelimitedTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [result, formAction, importing] = useActionState(importCMDBAction, null);

  const load = (raw: string) => {
    setText(raw);
    const parsed = parseDelimited(raw);
    setTable(parsed);
    setMapping(guessColumnMapping(parsed.headers));
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    load(await file.text());
  };

  /*
   * `__attribute` is a UI choice, not a value the server knows — `mappingForSubmit`
   * turns it into `attr:<Spaltenname>`. Shared with the guess so a re-imported
   * export cannot end up as `attr:attr:RAM` on the second round trip.
   */
  const submitted = mappingForSubmit(mapping);

  const hasName = Object.values(submitted).includes("name");
  const mapped = Object.keys(submitted).length;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Datei</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            CSV oder Tabellen-Export. Trennzeichen wird erkannt; Anführungszeichen,
            Zeilenumbrüche im Feld und Semikolon-Dateien werden gelesen.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void readFile(event.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center transition-colors ${
              dragging
                ? "border-foreground/40 bg-accent/40"
                : "border-border hover:border-foreground/20"
            }`}
          >
            <FileSpreadsheetIcon
              className="size-8 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="text-sm">Datei hierher ziehen oder auswählen</span>
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
          </label>

          <div className="grid gap-2">
            <Label htmlFor="import-text">Oder einfügen</Label>
            <Textarea
              id="import-text"
              value={text}
              onChange={(event) => load(event.target.value)}
              rows={5}
              placeholder="Bezeichnung;Inventarnummer;Art;Firma"
              className="rounded-xl font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {table && table.headers.length > 0 && (
        <form action={formAction} className="grid gap-6">
          <input type="hidden" name="text" value={text} />
          <input type="hidden" name="mapping" value={JSON.stringify(submitted)} />
          <input type="hidden" name="delimiter" value={table.delimiter} />

          <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-medium">Spalten zuordnen</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Nicht zugeordnete Spalten werden nicht importiert. „Als Eigenschaft“
                  legt den Wert unter dem Spaltennamen ab.
                </CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full">
                {table.rows.length} Zeilen · {mapped} von {table.headers.length}{" "}
                Spalten
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-3">
              {table.headers.map((header) => (
                <div
                  key={header}
                  className="grid items-center gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[1fr_auto_1fr]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{header}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {table.rows[0]?.[header] || "—"}
                    </p>
                  </div>

                  <span className="hidden text-muted-foreground sm:inline" aria-hidden>
                    →
                  </span>

                  <Select
                    value={mapping[header] ?? IGNORE_COLUMN}
                    onValueChange={(value) =>
                      setMapping((current) => ({ ...current, [header]: value }))
                    }
                    disabled={importing}
                  >
                    <SelectTrigger
                      className="h-10 w-full rounded-xl"
                      aria-label={`Ziel für ${header}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE_COLUMN}>Nicht importieren</SelectItem>
                      <SelectItem value={AS_ATTRIBUTE}>Als Eigenschaft</SelectItem>
                      {CI_IMPORT_TARGETS.map((target) => (
                        <SelectItem key={target.key} value={target.key}>
                          {target.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Vorschau</CardTitle>
              <CardDescription className="mt-1">
                Die ersten Zeilen, wie sie zugeordnet sind.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.entries(submitted).map(([column, target]) => (
                        <TableHead key={column} className="whitespace-nowrap">
                          {target.startsWith(ATTRIBUTE_PREFIX)
                            ? column
                            : (CI_IMPORT_TARGETS.find(
                                (entry) => entry.key === target,
                              )?.label ?? target)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.rows.slice(0, 5).map((row, index) => (
                      <TableRow key={index}>
                        {Object.keys(submitted).map((column) => (
                          <TableCell
                            key={column}
                            className="max-w-48 truncate text-xs"
                          >
                            {row[column] || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {!hasName && (
            <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertDescription>
                Eine Spalte muss der Bezeichnung zugeordnet sein.
              </AlertDescription>
            </Alert>
          )}

          {result && !result.ok && (
            <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}

          {result?.ok && <ImportReport summary={result.summary} />}

          <Button
            type="submit"
            size="lg"
            disabled={importing || !hasName}
            className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            {importing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <UploadIcon strokeWidth={1.5} />
            )}
            {importing
              ? "Importieren …"
              : `${table.rows.length} Zeile(n) importieren`}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * What the import did.
 *
 * Skipped rows carry their line number as a spreadsheet shows it, because the next step
 * is always opening the file at that line. Unresolved references are listed once per
 * value rather than once per row — thirty assets of one unknown company is one missing
 * company, not thirty problems.
 */
function ImportReport({
  summary,
}: {
  summary: {
    created: number;
    updated: number;
    total: number;
    skipped: { row: number; reason: string }[];
    unresolved: { value: string; kind: string }[];
  };
}) {
  return (
    <Alert className="rounded-2xl border-border px-4 py-3">
      <CheckCircle2Icon strokeWidth={1.5} />
      <AlertDescription className="grid gap-2">
        <span>
          {summary.created} angelegt, {summary.updated} aktualisiert von{" "}
          {summary.total} Zeilen.
        </span>

        {summary.unresolved.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Nicht aufgelöst:{" "}
            {summary.unresolved
              .map((entry) => `${entry.kind} „${entry.value}“`)
              .join(", ")}
          </span>
        )}

        {summary.skipped.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Übersprungen:{" "}
            {summary.skipped
              .slice(0, 12)
              .map((entry) => `Zeile ${entry.row} (${entry.reason})`)
              .join(", ")}
            {summary.skipped.length > 12 &&
              ` … und ${summary.skipped.length - 12} weitere`}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
