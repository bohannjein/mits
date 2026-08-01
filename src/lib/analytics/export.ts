import type { AnalyticsData } from "@/lib/analytics/queries";
import { bucketLabel, type Granularity } from "@/lib/analytics/range";

/* ──────────────────────────────────────────────────────────────────────────
   The panel's numbers as a CSV somebody can open in a spreadsheet.

   Pure, so the escaping is checkable. That is the whole reason this is its own
   file: a title containing a semicolon or a line break silently shifts every
   column to its right, and the result opens without complaint and is wrong.

   One file with several labelled sections rather than one export per widget. A
   person exporting this is building a report, and eight downloads to assemble one
   sheet is the workflow this button exists to remove.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Semicolon, not comma.
 *
 * German Excel reads a comma-separated file as one column per row unless the user
 * knows about the import dialog. The separator that works in the place this is
 * used beats the one the format is named after.
 */
const SEP = ";";

/**
 * Quote a field if it could otherwise break the row.
 *
 * Doubling the quote is the RFC 4180 escape. Checked for the separator, both line
 * endings and the quote itself — a ticket title legitimately contains all four.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  if (!/[";\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

const row = (cells: (string | number | null)[]): string =>
  cells.map(csvCell).join(SEP);

/** `41` → `41 Min`, `310` → `5:10 Std`, null → an empty cell. */
function minutes(value: number | null): string {
  if (value === null) return "";
  if (value < 60) return `${value} Min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0
    ? `${hours} Std`
    : `${hours}:${String(rest).padStart(2, "0")} Std`;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * The whole panel as one sheet.
 *
 * Sections are separated by a blank line and introduced by a heading row, which
 * is what a spreadsheet reader expects and what lets somebody select one block.
 * Empty sections are skipped entirely — a heading over nothing invites the reader
 * to conclude the number is zero rather than switched off.
 */
export function analyticsToCsv(data: AnalyticsData): string {
  const lines: string[] = [];
  const granularity: Granularity = data.range.granularity;

  lines.push(row(["MITS Analytics"]));
  lines.push(row(["Zeitraum", data.range.label]));
  // Both bounds spelled out: a file that says "Letzte 30 Tage" is unreadable in
  // six weeks, and this one will outlive the session that produced it.
  lines.push(row(["Von (UTC)", data.range.from]));
  lines.push(row(["Bis (UTC)", data.range.to]));
  lines.push(row(["Erzeugt am (UTC)", new Date().toISOString()]));
  lines.push("");

  lines.push(row(["Kennzahlen"]));
  lines.push(row(["Eingegangen", data.totals.created]));
  lines.push(row(["Erledigt", data.totals.resolved]));
  lines.push(row(["Aktuell offen", data.totals.open]));
  lines.push(row(["Meldende Personen", data.totals.reporters]));
  lines.push("");

  if (data.resolutionTime.sample > 0 || data.firstResponse.sample > 0) {
    lines.push(row(["Zeiten", "Median", "Mittel", "Datenbasis"]));
    lines.push(
      row([
        "Lösungszeit",
        minutes(data.resolutionTime.median),
        minutes(data.resolutionTime.mean),
        data.resolutionTime.sample,
      ]),
    );
    lines.push(
      row([
        "Erstreaktion",
        minutes(data.firstResponse.median),
        minutes(data.firstResponse.mean),
        data.firstResponse.sample,
      ]),
    );
    lines.push("");
  }

  section(lines, "Top Ticket-Ersteller", ["Person", "Tickets"], data.topCreators);
  section(lines, "Gelöst pro Agent", ["Agent", "Tickets"], data.resolvedPerAgent);
  section(lines, "Nach Status", ["Status", "Tickets"], data.distribution.status);
  section(lines, "Nach Priorität", ["Priorität", "Tickets"], data.distribution.priority);
  section(lines, "Nach Formular", ["Formular", "Tickets"], data.distribution.schema);

  if (data.creatorTopics.length > 0) {
    lines.push(row(["Themen pro Anwender"]));
    lines.push(row(["Person", "Formular", "Tickets"]));
    for (const entry of data.creatorTopics) {
      for (const topic of entry.topics) {
        lines.push(row([entry.creator, topic.label, topic.value]));
      }
    }
    lines.push("");
  }

  if (data.series.length > 0) {
    lines.push(row(["Verlauf"]));
    lines.push(row(["Zeitraum", "Eingegangen", "Erledigt"]));
    for (const point of data.series) {
      // The key *and* the label: the key sorts and the label reads, and a
      // spreadsheet sorted by "KW 32" alphabetically is a mess.
      lines.push(
        row([
          point.bucket,
          point.created,
          point.resolved,
        ]),
      );
    }
    lines.push("");
  }

  if (data.heatmap.some((day) => day.some((value) => value > 0))) {
    lines.push(row(["Peak-Zeiten (UTC)"]));
    lines.push(row(["Tag", ...Array.from({ length: 24 }, (_, hour) => `${hour}`)]));
    data.heatmap.forEach((day, index) => {
      lines.push(row([WEEKDAYS[index] ?? String(index), ...day]));
    });
    lines.push("");
  }

  // Trailing newline: some tools drop the last row without one.
  return `${lines.join("\r\n")}\r\n`;
}

function section(
  lines: string[],
  title: string,
  headers: string[],
  rows: { label: string; value: number }[],
): void {
  if (rows.length === 0) return;
  lines.push(row([title]));
  lines.push(row(headers));
  for (const entry of rows) lines.push(row([entry.label, entry.value]));
  lines.push("");
}

/** `mits-analytics-2026-08-01.csv` — sortable, and unique enough per day. */
export function csvFilename(now: Date): string {
  return `mits-analytics-${now.toISOString().slice(0, 10)}.csv`;
}

/** Re-exported so the route can label buckets without importing `range` twice. */
export { bucketLabel };
