---
paths:
  - "src/lib/shortcuts.ts"
  - "src/hooks/use-keyboard-shortcuts.ts"
  - "src/components/layout/shortcut-*.tsx"
  - "src/components/tickets/*-shortcuts.tsx"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Kürzel, Formular-Isolation, Hilfe-Dialog
## Tastatur zuerst

`hooks/use-keyboard-shortcuts.ts` ist ein `keydown`-Listener auf `window` und
eine Regel: `swallowsKeys` (`lib/shortcuts.ts`, rein, in `npm test`).

**Die Regel ist die ganze Sicherheit des Systems.** Zu großzügig, und ein `m`
mitten in einer Antwort weist das Ticket zu und verschluckt den Buchstaben — ein
stiller, falscher Schreibvorgang aus einem Tastendruck, der als Text gemeint war.
Vier Dinge zählen als Tippen, die letzten beiden werden vergessen:

- `<input>`, außer den Typen ohne Text. Ein Formular voller Schalter darf die
  Kürzel der Seite nicht abschalten.
- `<textarea>` und `<select>`.
- **`contenteditable`** — das ist der Rich-Text-Editor. Kein Input-Element, ein
  `instanceof HTMLInputElement` verfehlt ihn also vollständig, und er ist die
  wahrscheinlichste Stelle für ein getipptes `r`.
- Alles in einem offenen Dialog oder Menü. Radix setzt den Fokus auf ein `<div>`;
  ein Kürzel, das hinter einem Modal feuert, wirkt auf eine unsichtbare Seite.

`swallowsKeys` ist von `isTypingTarget` getrennt: die Entscheidung ist rein und
prüfbar, der DOM-Zugriff ist es nicht.

**Escape ist die Ausnahme von genau dieser Regel** und wird zuerst behandelt: es
ist die einzige Taste, deren Aufgabe darin besteht, aus dem Feld herauszuführen,
in dem man tippt. Es blurrt und löscht nichts — ein Kürzel, das eine halb
geschriebene Antwort verwirft, weil jemand aus Gewohnheit nach Escape greift,
wäre unverzeihlich.

| Wo | Taste | Was |
|---|---|---|
| überall | `Strg`+`K` · `?` · `Esc` | Suche · Hilfe · Feld verlassen |
| Queue | `J` `K` · `Enter` · `C` | Zeile tiefer/höher · öffnen · Zuständigkeit |
| Ticket | `R` · `M` · `I` | Antwortzeile · mir zuweisen · interne Notiz |

- **`m` schreibt aus einem Tastendruck**, als einziges. Vertretbar aus drei
  Gründen: Zuweisung ist mit einem Klick umkehrbar, `assignTicket` lehnt eine
  Nicht-Änderung ab, und `swallowsKeys` garantiert, dass die Taste kein
  Buchstabe war. Gegen eine gehaltene Taste sichert ein `busy`-Ref — ohne das
  postet ein aufgestützter Ellenbogen dieselbe Zuweisung dreißigmal.
- **Der j/k-Cursor ist ein DOM-Attribut**, kein React-State. `TicketTable` bleibt
  Server Component (die relativen Alter werden einmal beim Rendern gerechnet);
  sie für einen Rahmen zum Client zu machen hieße, fünfzig Zeilen Formatierung in
  den Browser zu verlegen. `data-cursor` wird gesetzt, `globals.css` malt.
- **Die Zeilen werden bei jedem Tastendruck neu gesucht.** Ein gecachtes
  `NodeList` zeigt nach dem nächsten Realtime-Refresh auf Elemente, die nicht
  mehr im Dokument sind — die Markierung bliebe einfach aus, ohne Hinweis.
- **`c` fokussiert, es schaltet nicht um.** „Pool" und „Mein Bereich" sind zwei
  benannte Ziele; eine Taste, die zwischen ihnen kippt, hat eine Wirkung, die
  davon abhängt, wo man schon war.
- **Die Hilfe ist geschrieben, nicht generiert.** Eine erzeugte Liste wäre ehrlich
  darüber, was gebunden ist, und nutzlos als Dokumentation — sie kann nicht
  sagen, was `c` bedeutet. `npm test` prüft dafür, dass keine Gruppe dieselbe
  Taste zweimal vergibt.
- **`Kbd` ist eine Komponente.** Drei handgebaute Kopien der Tastenkappe waren
  schon beim Padding auseinander. Unter `sm` versteckt, außer im Hilfe-Dialog,
  wo die Kappen der Inhalt sind.
