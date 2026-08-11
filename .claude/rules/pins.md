---
paths:
  - "src/lib/ticket-pins.ts"
  - "src/app/actions/pins.ts"
  - "src/components/tickets/pin-button.tsx"
---

# Tickets anheften

`feature_ticket_pins`, an per Default. Ein Agent hält ein Ticket oben in seiner
Queue — Knopf in der Action-Bar, Symbol in jeder Zeile, eigener Block über der
Tabelle.

## Ein Pin ist ein Lesezeichen, keine Eskalation

**Pro Person, nie geteilt.** `mits_ticket_pin` hat das Paar (Person, Ticket) als
Primärschlüssel und sonst nur `created_at`. Ein geteilter Pin wäre ein Agent, der
die Queue aller anderen umsortiert — und dieses Werkzeug gibt es schon, es heißt
Priorität und steht am Ticket. Der Pin sagt „ich komme darauf zurück", nicht „das
ist dringend".

**Der Pin hat keine Eigenschaften.** Kein Grund, keine Notiz, keine
Handsortierung. Er ist da oder nicht; zweimal anheften ist derselbe Zustand wie
einmal, weshalb das Paar der Schlüssel ist und nicht eine eigene Id.

**`MAX_PINS = 20`.** Zweihundert Pins sind eine zweite Queue mit denselben Zeilen
und ohne deren Filter. Der Deckel ist außerdem, was den Block über der Tabelle
klein hält — er wird auf jeder Seite gerendert.

**Erst lösen, dann die Grenze prüfen.** `togglePin` setzt das `DELETE` vor die
Deckelprüfung. Wer über der Grenze steht (Deckel gesenkt, Zeilen von Hand
eingefügt), muss lösen können; ein Deckel, der den Ausgang mit verschließt, ist
kein Deckel, sondern eine Sperre.

**Zugriff wird beim Schreiben geprüft.** `getTicketFor`, dieselbe Tür wie bei den
Erinnerungen: eine Zeile, die ein Ticket benennt, ist schon eine Auskunft darüber,
dass die Id existiert. `null` heißt „gibt es nicht" **und** „darfst du nicht
sehen", damit sich über den Unterschied nichts aufzählen lässt.

**Agenten, nicht Melder.** `togglePinAction` prüft `canViewBoard` selbst — der
Knopf wird in der Melderansicht gar nicht gerendert, aber eine Server Action ist
als POST auf ihre Route erreichbar (Regel 6). Der Grund ist nicht Vertraulichkeit,
sondern dass die Melderliste keine Queue ist: sie hat drei Zeilen und keine
Sortierung, die man anheften könnte.

## Gelesen wird als Spalte, nicht als Schleife

`searchTickets` hängt ein `EXISTS`-Prädikat mit gebundenem `user_id` als Spalte
`pinned` an. Fünfzig Einzelabfragen für eine Ja/Nein-Frage kosten mehr als die
Abfrage, die sie mitliefert.

⚠️ **Der Ausdruck steht als letzter in der SELECT-Liste, sein Parameter als
letzter in `boundSelectParams`.** Alles dort bindet positionsgenau; ein Ausdruck,
der oberhalb eingefügt wird, verschiebt jeden folgenden Parameter — und das
Ergebnis ist gültiges SQL, das eine andere Frage beantwortet. Weder `typecheck`
noch `build` führt ein Statement aus. Dagegen steht der Partitionstest in
`scripts/verify-db.mts`.

**`MITSTicket.pinned` ist per Default `false`**, wie `unread` daneben: nur
`searchTickets` rechnet es aus. Die Ticketseite lädt über `getTicketFor` und liest
deshalb `isPinned(id, user.id)` einzeln — `ticket.pinned` wäre dort eine
Behauptung, keine Antwort.

## Zwei Blöcke, eine Filterung

`pinnedOnlyFor` und `excludePinnedFor` sind Komplemente über **derselben**
Filterung. Der Block oben ist dieser Queue-Ausschnitt hochgezogen, keine zweite
Queue.

- **Der Block folgt Reiter und Filter.** Ein Pin in „Wartend" ist nicht sichtbar,
  solange „Eingang" aktiv ist. Eine Zeile über der Tabelle, die dem Filter
  darunter widerspricht, ist schlechter als eine Zeile einen Klick entfernt.
- **`excludePinnedFor` an der Liste**, damit kein Ticket zweimal auf einem Schirm
  steht — und `countSearchTickets` läuft mit derselben Filterung, sonst zählte der
  Pager Zeilen mit, die die Liste nicht mehr zeigt.
- **Die Zahlen gehen sichtbar auf.** Das Reiter-Badge zählt weiter alles, der
  Pager die Liste darunter, der Block seine eigene Zahl in der Überschrift:
  `2 + 48 = 50`. Ohne die Zahl in der Überschrift wären es zwei Werte, die still
  auseinanderlaufen.
- **Kein Blättern im Block**, und er steht auf jeder Seite. Ein Pin, von dem man
  wegblättern kann, ist kein Pin.
- **Leer heißt weg.** Kein Block, keine Überschrift, keine Karte mit „keine
  angehefteten Tickets" — dieselbe Regel, die das Erinnerungs-Widget bei leerer
  Liste `null` rendern lässt. „Alle Tickets" als Überschrift erscheint ebenfalls
  nur, wenn es zwei Blöcke zu unterscheiden gibt.
- **„Keine Tickets in dieser Ansicht" nur, wenn beide leer sind.** Sonst stünde
  der Satz über einer Tabelle mit Zeilen darin.
- **Der j/k-Cursor läuft in Dokumentreihenfolge**, also Pins zuerst. Das ist die
  gewünschte Reihenfolge und braucht keinen Eingriff in `queue-shortcuts.tsx`:
  beide Tabellen setzen `data-ticket-row`.

## Darstellung

- **`accent` als Prop an `TicketTable`, kein Rahmen drumherum.** Ein `<section>`
  mit eigenem Rahmen um eine Karte mit Rahmen sind zwei Linien zwölf Pixel
  auseinander, und das liest sich als Renderfehler — dieselbe Begründung, aus der
  die Antwortzeile in `TicketFrame` ihren eigenen Rahmen verloren hat. `accent`
  tauscht `border-border` gegen `border-primary/30`, eine Linie und keine Fläche.
- **Die Pin-Spalte hat keine Beschriftung**, nur eine für Screenreader. Ein Wort
  über einer Spalte aus Symbolen wäre das Breiteste darin und nähme die Breite dem
  Titel weg.
- **Nicht sortierbar.** Der Block *ist* die Sortierung; ein zusätzlicher
  Spaltenkopf wäre ein zweiter Weg zum selben Ergebnis. Der Block trägt deshalb
  auch kein `sortBasePath` — zwei Kopfzeilen mit Sortierlinks übereinander sind
  zwei Steuerungen für eine Sortierung.
- **`stopPropagation` im Klick-Handler.** Die Zeile trägt `data-ticket-href` für
  den Cursor; wer anheftet, will das Ticket gerade *nicht* öffnen.
- **Kein `<form>`.** `FormData` von Hand plus `startTransition`, wie beim
  Zurückziehen einer Nachricht: die Zeile wird unter dem Knopf neu gerendert,
  sobald ein Realtime-Signal kommt, und ein Formular in einem ausgetauschten
  Element schickt ins Leere. Ohne die Transition warnt React und `pending`
  schaltet nie um.
- **Erfolg meldet sich nicht.** Die Zeile wandert in den Block oder aus ihm
  heraus — das *ist* die Rückmeldung. Nur der Fehlerfall bekommt einen Toast, weil
  er sonst nirgends steht.
- **Der optimistische Zustand wird bei Erfolg nicht zurückgenommen.** Er
  entspricht dann dem, was der Server geschrieben hat, und das Prop zieht mit der
  Revalidierung nach. Ihn sofort zurückzusetzen wäre ein sichtbares Flackern auf
  genau dem Symbol, das gerade gedrückt wurde.
- **Eine Komponente mit zwei Varianten** (`bar`, `row`), nicht zwei Komponenten:
  dieselbe Action, derselbe Zustand, dasselbe Symbolpaar (`Pin` / `PinOff`).
