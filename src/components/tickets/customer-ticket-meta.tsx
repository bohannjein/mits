import { Badge } from "@/components/ui/badge";
import {
  CUSTOMER_META_FIELDS,
  CUSTOMER_META_FIELD_LABELS,
  TICKET_STATUS_LABELS,
  type CustomerMetaField,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die Kennzahlen des Tickets, rechts neben dem Gespräch.

   Sechs Zeilen, jede einzeln abschaltbar unter `/admin/settings/tickets`. Die
   Werte sind fertig formatiert, wenn sie hier ankommen — Zeitzone und relative
   Zeit sind Server-Entscheidungen, und ein zweiter Formatierer im Browser wäre
   eine zweite Antwort auf „wie alt ist das".

   **Keine Priorität.** Sie ist kein Feld, das hier fehlt, sondern eines, das
   nicht dazugehört: ein Melder kann sie nicht setzen, und „Niedrig" am eigenen
   Problem liest sich als Urteil statt als Einplanung. Das war schon die Regel für
   die einspaltige Fassung dieser Seite und bleibt sie.

   **Eine leere Karte wird nicht gerendert.** Wer alle sechs Felder abschaltet,
   hat die Spalte abgeschaltet — nur eben feldweise, und eine Karte mit einer
   Überschrift und nichts darunter sieht kaputt aus, statt zu fehlen.
   ────────────────────────────────────────────────────────────────────────── */

export interface CustomerMetaValues {
  /** Der Titel des Formulars, mit dem gemeldet wurde. */
  type: string;
  /** „vor 3 Tagen" — serverseitig gerechnet. */
  age: string;
  /** Datum und Uhrzeit in der Zeitzone der Instanz. */
  created: string;
  /** Der lesbare Kategoriepfad, oder leer. */
  category: string;
  /** Der Name des Bearbeiters, oder leer für „Ausstehend". */
  assignee: string;
}

export function CustomerTicketMeta({
  ticket,
  values,
  fields,
}: {
  ticket: MITSTicket;
  values: CustomerMetaValues;
  /** Welche Zeilen diese Instanz zeigt. */
  fields: Record<CustomerMetaField, boolean>;
}) {
  const shown = CUSTOMER_META_FIELDS.filter((field) => fields[field]);
  if (shown.length === 0) return null;

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-elev-1">
      <h2 className="label-industrial">Ticket</h2>

      {/*
        Ein `<dl>`, wie `PayloadFields`: es ist eine Liste aus Bezeichnung und
        Wert, und das ist das Element dafür. Zwei Spalten, damit die Werte auf
        einer gemeinsamen Kante beginnen — untereinander gestapelt wären es zwölf
        Zeilen für sechs Angaben.
      */}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        {shown.map((field) => (
          <div key={field} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-xs text-muted-foreground">
              {CUSTOMER_META_FIELD_LABELS[field]}
            </dt>
            <dd className="min-w-0 break-words">
              {field === "status" ? (
                <Badge
                  variant="secondary"
                  className="h-auto rounded-full px-2.5 py-0.5 text-xs font-normal"
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
              ) : (
                /*
                  „Ausstehend" nur beim Bearbeiter, ein Gedankenstrich sonst.
                  Ein unbesetztes Feld und ein noch nicht getroffener Zuschnitt
                  sind zwei verschiedene Auskünfte: „—" heißt „steht nicht dran",
                  „Ausstehend" heißt „ist noch nicht vergeben", und nur das zweite
                  beantwortet die Frage, mit der jemand auf diese Seite kommt.
                */
                <span
                  className={
                    valueFor(field, values) ? undefined : "text-muted-foreground"
                  }
                >
                  {valueFor(field, values) ||
                    (field === "assignee" ? "Ausstehend" : "—")}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function valueFor(field: CustomerMetaField, values: CustomerMetaValues): string {
  // `status` never reaches here — it renders as a badge above.
  if (field === "status") return "";
  return values[field];
}
