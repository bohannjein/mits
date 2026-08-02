---
paths:
  - "src/components/tickets/**"
  - "src/app/mits/tickets/**"
  - "src/app/customer/tickets/**"
  - "src/lib/ticket-*.ts"
  - "src/lib/tickets.ts"
  - "src/lib/macros.ts"
  - "src/lib/canned-responses.ts"
  - "src/lib/template-values.ts"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Ticket-Detailseite, Chatverlauf, Antwortzeile, Textbausteine
## Der Verlauf beginnt beim Melder

**Die Erstnachricht ist eine abgeleitete Bubble, keine gespeicherte.**
`openingMessageFor` (`lib/ticket-opening.ts`) baut zur Renderzeit einen
`TicketComment` aus dem Payload. Ein zweites Mal geschrieben hätte das Ticket zwei
Kopien seines eigenen Anliegens — eine durchsuchbare und eine angezeigte —, die
beim ersten korrigierten Feld auseinanderlaufen.

**Ausnahme Mail: `source === "email"`.** Der Ingest legt den Nachrichtentext schon
als echten ersten Beitrag ab, in bereinigtem HTML, damit die Formatierung
überlebt. Deshalb ist `email` ein `TicketSource`-Wert und deshalb überschreibt
`createTicket` ihn, wenn kein `MailIngestOrigin` dabei ist: ein Melder, der
`source: "email"` postet, verlöre sonst seine eigene Erstnachricht aus dem Verlauf.

**Das Feld, das zur Bubble wurde, fällt aus der Angaben-Liste.**
`fieldsBesidesOpening` — sonst steht dasselbe Anliegen zweimal auf der Seite, einmal
als Nachricht und einmal als beschriftetes Feld daneben.

## Wo ein ausgefülltes Formular landet: `ticket_display`

Ein Ticket trägt eine Payload — die Antworten auf ein Schema. Die standen früher
in einer Liste **neben** dem Verlauf (Agent: Sidebar-Abschnitt „Angaben", Melder:
zugeklapptes „Meine Angaben"), während nur das Freitextfeld eine Nachricht wurde.
Damit war eine Einsendung auf zwei Orte verteilt, und die Hälfte, die sich wie ein
Gespräch liest, ließ den größeren Teil weg.

`getTicketFormDisplay()` (`lib/ticket-display.ts`, Key `ticket_display`, Maske
`/admin/settings/tickets`) hat drei Werte:

| Wert | Wirkung |
|---|---|
| `chat` (Default) | Antworten in der Eröffnungs-Bubble, unter dem Text des Melders |
| `panel` | die alte Anordnung — Liste in Sidebar bzw. Accordion |
| `both` | in der Nachricht **und** in der Liste |

- **Eigener Setting-Key, kein Feld in `system`.** Zwei Masken, die einen Blob
  teilen, überschreiben sich gegenseitig Abschnitte — dieselbe Begründung wie bei
  den fünf `portal_*`-Keys.
- **Serverseitig gelesen, nicht pro Konto.** Kein `localStorage`: ein Agent und
  der Melder, die über dasselbe Ticket sprechen, müssen dieselbe Seite beschreiben.
- **`chat` braucht eine Bubble, an die es sich hängen kann.** Ein Mail-Ticket hat
  keine synthetische Eröffnung (`openingMessageFor` gibt dort `null`), also fällt
  es auf die Liste zurück — Antworten, die niemand sieht, wären das einzige
  Ergebnis, das schlimmer ist als Antworten an der falschen Stelle. Die Maske sagt
  das, sonst hält ein Admin die Einstellung für kaputt.
- **Die Slots heißen `details` (`ChatBubble`) und `openingDetails`
  (`TicketMessages`).** Angehängt wird an `isSyntheticOpening`, nicht an Position
  0: die Liste ist in beiden Ansichten dieselbe Reihenfolge, aber „die erste
  Bubble" ist in einem gewachsenen Verlauf eine andere Nachricht.
- **Im Pop-out gibt es nur `chat`.** Das Fenster hat keine Sidebar und kein
  Accordion; bei `panel` stehen die Angaben dort also nicht — sie sind einen Klick
  entfernt in der vollen Ansicht.
- **`PayloadFields` ist die einzige Stelle mit dem `<dl>`**, und
  `formatPayloadValue`/`payloadFields` (`lib/ticket-opening.ts`, in `npm test`) die
  einzige mit der Formatierung. Vorher lag `formatValue` zweimal identisch in den
  beiden Seiten — zwei Orte, an denen dieselbe Antwort anfängt, verschieden zu
  lesen, und zwar auf Schirmen, auf denen ein Melder und ein Agent darüber
  sprechen.

**Position ist absolut, Farbe ist relativ.** Zwei Achsen, die verschiedene Fragen
beantworten — und sie stimmen absichtlich nicht überein.

`side` hängt am **Sprecher**: Melder links, Team rechts, in beiden Ansichten.
Die naheliegende Spiegelung („eigene Nachrichten rechts", wie ein
Handy-Messenger) war gebaut und ist wieder raus: derselbe Verlauf hätte zwei
Layouts, ein Screenshot vom Melder und einer vom Agenten liegen nicht
übereinander, und „die Nachricht links" in einer Übergabe wäre keine Ortsangabe
mehr.

`tone` hängt am **Betrachter**: `toneFor(comment, viewerId)` gibt Grau für
eigene Nachrichten, Blau für die der Gegenseite. Auf dem Schirm des Agenten sind
seine Antworten grau und die des Melders blau, auf dem Schirm des Melders
umgekehrt. Vorher war auch die Farbe am Sprecher festgemacht; geändert auf
Wunsch, weil das Erste, wonach jemand in einem Verlauf sucht, die eigene Hälfte
ist. Die Position sagt *wer*, die Farbe sagt *ob du das warst*.

- **Verglichen wird `author_id`, nicht `author_is_agent`.** Zwei Agenten auf
  einem Ticket sehen einander sonst beide als „das Team" und beide grau.
- **Amber ist die Ausnahme und bleibt absolut.** Eine interne Notiz markiert
  *Sichtbarkeit*, keinen Sprecher; sie in der eigenen Farbe zu zeigen nähme ihr
  das einzige Signal, das „geht nicht an den Melder" sagt.
- **Das Rollen-Label kam aus `TONES` raus** (`roleLabel`). Die Farbe beantwortet
  jetzt „war ich das", der Chip weiterhin „wer war es" — zusammengelegt hätte
  die eigene Antwort eines Agenten auf seinem eigenen Schirm „Kunde" geheißen,
  weil das die graue ist.

`ChatBubble` nimmt beide Achsen als Prop — die geteilte Komponente soll keine
Perspektive einbetoniert haben.

## Kunden-Eingang: Chat statt Formular

`/customer/new`, Tab „Schnellmeldung“, ist `ChatIntake` und nicht `SchemaForm` —
**dasselbe Schema, dieselbe Payload, derselbe `POST /api/tickets`**, nur eine
andere Maske. Es gibt keinen zweiten Weg in die Ticket-Tabelle.

- **Drei Pills statt einer Auswahlliste**, `INTAKE_CATEGORIES` in `types/mits.ts`.
  Feste Liste, weil der Wert im Payload landet und gegen das `enum` in
  `QUICK_TICKET_SCHEMA` validiert wird — eine Liste, die davon abweicht, wäre ein
  Knopf, der sich nicht absenden lässt. `npm test` prüft beide gegeneinander.
- **`category` ist optional.** Wer nur beschreiben will, was kaputt ist, soll das
  nicht erst einsortieren müssen. Eine unbeantwortete Kategorie ist eine Frage an
  den Agenten, eine erzwungene ist eine Wand vor einer Supportanfrage.
- **Die ganze Karte ist die Drop-Zone**, nicht ein gestricheltes Rechteck daneben.
  Der `dragDepth`-Zähler ist nötig, weil `dragleave` auch beim Wechsel auf ein
  Kindelement feuert.
- **Die Kunden-Detailansicht teilt sich `TicketDetail` nicht mehr** mit der
  Agentenseite. Eine mittige Spalte, schlanker Kopf, Verlauf — keine Priorität
  (die kann ein Melder nicht setzen, und „Niedrig“ am eigenen Problem liest sich
  als Urteil), kein Bearbeiter, keine Worklogs. Die Angaben bleiben als
  zugeklapptes Accordion.

**Verknüpfungen sind ein Fenster in andere Tickets.** `listLinksFor` prüft **jedes** Ziel
einzeln mit `getTicketFor` und lässt ein nicht sichtbares Ticket komplett weg — nicht als
„gesperrt". Auch „hier liegt ein Ticket, das du nicht öffnen darfst" ist eine Auskunft
darüber, welche Tickets existieren. Eine Zeile pro Paar, die Gegenrichtung wird beim Lesen
über `TICKET_LINK_INVERSE_LABELS` invertiert.

**Textbausteine werden eingesetzt, nie gesendet.** Platzhalter löst der Server auf, damit der
Browser den Namen des Melders nicht für ein Template zugestellt bekommt. Was rausgeht,
bestätigt die Technik — dieselbe Regel wie bei der KI-Triage.

## Chat-First: der Verlauf bekommt den Platz

Die Ticketseite ist eine Konversation mit Beiwerk, nicht ein Formular mit einem
Chat darin. Was das konkret heißt:

**Die Antwortzeile ist eine Zeile.** Sie startet einzeilig und wächst mit dem
Text; die drei Dinge, die man mit ihr tut, sitzen **innerhalb** ihres Rahmens
rechts — `Type` für die Formatierung, `Paperclip` für eine Datei, der
Senden-Knopf. Außerhalb wären es Bedienelemente unter einem Feld, also ein
Formular; innerhalb ist es eine Chat-Eingabe.

**Die Formatierungsleiste ist eingeklappt.** Sechzehn Knöpfe über einem
einzeiligen Feld sind mehr Rahmen als Inhalt, und die überwiegende Mehrheit der
Antworten ist Prosa. Ein Klick auf `Type` oder `Strg+Umschalt+X` klappt sie auf,
und sie bleibt offen — wer viel formatiert, zahlt einmal pro Antwort dafür.

- **Der Datei-Input liegt außerhalb der Leiste.** Ihn miteinzuklappen hieße, dass
  die Büroklammer ins Leere greift, sobald die Formatierung zu ist — und
  Anhängen ist keine Formatierungsentscheidung.
- **Bedingt gerendert, nicht `hidden`.** Das Element trägt `flex`, und eine
  klassenbasierte `display`-Regel schlägt die User-Agent-Regel hinter `[hidden]`:
  die Leiste wäre sichtbar geblieben.
- **Der Senden-Knopf gehört dem Formular, nicht einem der beiden Felder.** Beim
  Umbau war er in den Rich-Zweig gerutscht, womit die Melderansicht keinen mehr
  hatte und der Ref, den das Strg+Enter-Kürzel klickt, ins Leere zeigte. Jetzt
  eine geteilte Komponente, die beide Varianten rendern.

**Der Kopf ist drei Zeilen statt fünf.** Zurück-Link, Nummer und Titel teilen
sich eine Reihe; Melder, Zeitpunkt, Status, Priorität, Zuweisung und Tags sind
ein umbrechender Streifen darunter. Nichts ist verschwunden — es ist nur nicht
mehr gestapelt, und jede eingesparte Zeile geht direkt an den Verlauf. Die
Zuweisung ist neu dabei: das am häufigsten geprüfte und am seltensten geänderte
Attribut gehört dorthin, wo man es lesen kann, ohne etwas aufzuklappen.

**Die Sidebar klappt weg** (der Schalter saß schon im Kopf) und trägt jetzt
engere Abstände: sechs bis sieben Abschnitte mal drei Pixel sind eine halbe
Sektionshöhe auf einem Laptop. Eingeklappt dehnt sich die Chat-Spalte auf die
volle Breite, weil das `aside` dann gar nicht erst gerendert wird.

## Die Ticket-Seite ist eine App, kein Dokument

`TicketFrame` — drei Regionen in der Chat-Spalte, und nur die mittlere scrollt:
statischer Kopf, `flex-1 overflow-y-auto` Verlauf, statische Antwortzeile. Die
Sidebar ist eine vierte Region mit eigenem Scrollbereich.

- **`min-h-0` auf jedem Vorfahren zwischen Viewport und Scrollcontainer.** Das ist
  der ganze Trick und das ganze Fehlerbild: ein Flex-Kind schrumpft von sich aus
  nicht unter seinen Inhalt, also wächst ohne das die mittlere Region mit dem
  Verlauf, die Spalte wächst mit, und die *Seite* bekommt den Scrollbalken. Sieht
  aus wie ein funktionierendes Layout — bis jemand ein Ticket mit vierzig
  Antworten öffnet.
- **Die Höhe kommt aus der Flex-Kette, nicht aus `calc(100vh - 64px)`.** Der
  `AppHeader` ist `flex-wrap`; unter `sm` nimmt die Suche eine eigene Zeile, der
  Header ist dann höher als 64 px — und zwar auf genau den Schirmen, auf denen eine
  aus dem Bild geschobene Antwortzeile nicht zurückscrollbar ist.
- **Fixiert erst ab `lg`.** Darunter gibt es keine zweite Spalte und keine Höhe für
  drei Regionen; dort scrollt die Seite normal und die Sidebar folgt dem Verlauf,
  statt zu verschwinden.
- **Die Antwortzeile ist Geschwister des Scrollcontainers, nicht sein Kind.** Vorher
  hielt sie ein `sticky bottom-0` von innen fest — eine Uneinigkeit über den
  Sticky-Kontext entfernt davon, mit dem Verlauf wegzuscrollen.
- **Ein Composer für beide Ansichten**, `variant: "rich" | "plain"`. Vorher hatten
  `TicketChat` und `TicketThread` je eine eigene Kopie der Send-Action, des
  Clear-on-Success-Effekts und der Baustein-Einfügung — drei Dinge, die sich gleich
  verhalten müssen und zwei Implementierungen hatten.
- **`TicketFrame` ist nicht `SplitView`.** Letzteres ist ein Seitenkopf über zwei
  scrollenden Spalten und bleibt für FAQ und CMDB. Zusammenlegen wäre ein Boolean,
  der das DOM umbaut, mit drei Seiten am nicht genommenen Zweig.
- **`body` ist `h-full`, nicht `min-h-full`.** Die Kette braucht irgendwo oben eine
  *definite* Höhe zum Aufteilen; `min-height: 100%` ist keine. Die Regionen mit
  `min-h-0` bemaßen sich damit weiter nach ihrem Inhalt, und die Seite scrollte
  trotz allem als Ganzes. Gewöhnliche Seiten merken davon nichts: deren `main`
  behält `min-height: auto`, wächst über den Viewport hinaus und bekommt den
  normalen Fensterscrollbalken samt Innenabstand. Nur wer `min-h-0` ausdrücklich
  gesetzt hat, ist begrenzt — und das sind genau die sechs App-Shell-Seiten.
- **Der Kopf ist auf `38vh` gedeckelt und scrollt darüber hinaus selbst.** `shrink-0`
  schützt den Kopf vor einem langen Verlauf, aber nichts schützte den Verlauf vor
  einem langen Kopf: die Agentenansicht hängt jedes maschinell gesetzte Tag dorthin,
  die Melderansicht ein aufklappbares „Meine Angaben“. Der Verlauf ist das einzige
  `flex-1` der Kette, also ging dieses Wachstum vollständig von ihm ab. `vh` und
  nicht `%`, weil ein prozentualer `max-height` eine aufgelöste Elternhöhe braucht —
  in einer Zeile mit Auto-Höhe wird `max-h-[40%]` zu `none` und deckelt nichts.
- **Die Chat-Spalte ist `bg-background`, nicht `bg-card`.** Die Melder-Bubble *ist*
  `--card`; auf einer kartenfarbenen Spalte verschwand jede eingehende Nachricht in
  ihrem Untergrund. Die Spalte ist die Hülle, Bubbles und Antwortzeile das Erhabene
  darauf. Aus demselben Grund hat die Antwortzeile im Normalzustand keinen eigenen
  Rahmen mehr — der Frame zeichnet schon eine Linie darüber, und zwei Linien zwölf
  Pixel auseinander lesen sich als Renderfehler.

### Der Verlauf ist live

`TicketLive` pollt `GET /api/tickets/[id]/activity` alle 8 s und ruft bei
Änderung `router.refresh()`. Vorher war der Verlauf so statisch wie jede andere
serverseitig gerenderte Liste — sichtbar wurde eine Antwort erst, wenn
`AutoRefresh` vorbeikam, und das ist per Default alle **drei Minuten** und nie
schneller als eine. Eine korrekte Seite und ein kaputter Chat.

- **Gepollt wird ein Fingerabdruck, nicht die Nachrichten.** Neunundneunzig von
  hundert Ticks kosten damit einen indizierten `COUNT`, keine Kopie der
  Konversation. Wichtiger: es bleibt bei **einer** Stelle, die entscheidet, was
  jemand sehen darf. Kommentare hier auszuliefern hieße, die Regel für interne
  Notizen in eine zweite Datei zu schreiben.
- **`ticketActivityFingerprint` wird von beiden Seiten aufgerufen** — die Seite
  gibt ihn als Startwert an den Client, die Route liefert ihn bei jedem Tick.
  Verglichen wird auf Gleichheit, ein Unterschied im Aufbau wäre also keine
  Unsauberkeit, sondern eine Seite, die entweder nie oder endlos aktualisiert.
- **Im Fingerabdruck steht auch der Ticketzustand**, und zwar die sichtbaren
  Felder statt `updated_at`: sonst sähen zwei Agenten auf einem Ticket die
  Antworten des anderen live und dessen Statuswechsel gar nicht — und ein
  Schreibvorgang, den niemand sieht, zöge trotzdem jeden offenen Tab durch ein
  Re-Render.
- **Die Sichtbarkeitsregel steckt im Fingerabdruck.** Er bewegt sich für einen
  Melder nicht, wenn eine interne Notiz geschrieben wird — sonst wäre die
  Aktualisierung ein Seitenkanal, der ungefähr verrät, wann das Team über sein
  Ticket spricht.
- **`router.refresh()`, kein Reload.** Eine halb getippte Antwort überlebt die
  Nachricht, die währenddessen ankommt. Nirgends sonst zählt das mehr.
- **Zwei Raten: 2,5 s warm, 12 s ruhig.** Ein fester Wert war an beiden Enden
  falsch — zu langsam, während zwei Leute sich schreiben, und eine sinnlose
  Anfrage im Takt für die vierzig Tickets, die jemand vorletzte Woche in Tabs
  offen gelassen hat. Warm heißt: der Fingerabdruck hat sich in den letzten zwei
  Minuten bewegt. Eine selbst gesendete Antwort schaltet ebenfalls auf warm —
  wer gerade geschrieben hat, bekommt am ehesten gleich eine Antwort.
- **`lastChange` ist State, kein Ref.** Das Intervall muss sich beim Wechsel neu
  scharf stellen; mit einem Ref bliebe die Rate stehen, die beim Anlegen der
  Query galt, und der Poll kröche mit zwölf Sekunden durch genau den
  Wortwechsel, für den er schneller werden sollte. Ein Timer schaltet zurück,
  sonst bliebe `warm` hängen, bis irgendetwas anderes die Komponente neu rendert
  — und ihre ganze Aufgabe ist, nichts zu rendern.
- **Das ist nicht `AutoRefresh`.** Letzteres ist ein Seitenintervall in Minuten
  pro Konto; das hier ist die Konversation. Konfigurierbar zu machen hieße,
  jemanden einzuladen, fünf Minuten einzustellen und den Chat für kaputt zu
  halten.
- **Zwei Leserichtungen.** Die Agentenansicht ist ein Chat und liest älteste
  zuerst, das Neueste unten neben der Antwortzeile. Die Melderansicht ist eine
  Statusabfrage — jemand öffnet sein eigenes Ticket, um zu erfahren, ob geantwortet
  wurde, und dafür einen langen Verlauf durchzuscrollen ist die falsche Antwort auf
  die einzige Frage, mit der er gekommen ist. Dort steht das Neueste oben
  (`order="newest-first"`). Ein Prop und keine zweite Komponente: alles andere an
  der Liste ist gleich, zwei Kopien wären zwei Orte für den nächsten Scroll-Fehler.
- **Neu wird doppelt markiert: Ring und Trennlinie.** Der Ring an der Bubble sagt
  *welche* Nachrichten neu sind, die Linie *wo man anfangen soll zu lesen*. Einzeln
  ist beides schlechter — Ringe ohne Linie lassen jemanden den ersten suchen, eine
  Linie ohne Ringe verliert die Markierung, sobald sie wegscrollt. Ein Ring und
  keine eigene Fläche, weil die Fläche schon trägt, wer geschrieben hat.
- **`getTicketSeenAt` wird vor `markTicketRead` gelesen.** Die zweite Zeile
  überschreibt die Antwort der ersten; deshalb sind es zwei Funktionen und nicht
  ein Rückgabewert. Ein Aufruf, der zugleich meldet und weiterstellt, liest sich an
  der Aufrufstelle harmlos, und an dem Tag, an dem jemand ihn unter das Rendern
  schiebt, verschwindet die Markierung still.
- **Die eigenen Nachrichten sind nie neu.** Sie wurden per Definition nach dem
  letzten Besuch geschrieben; sie zu markieren hänge ein „neu“ an das, was der
  Leser gerade selbst getippt hat.
- **Automatisch an den Rand gescrollt wird nur, wer schon dort steht** (100 px
  Toleranz). Unbedingt zu scrollen war harmlos, solange sich die Liste nur bei
  einer Navigation änderte; in einem lebenden Verlauf reißt es jemanden aus der
  Nachricht, zu der er hochgescrollt hat, sobald die Gegenseite etwas sagt. Der
  erste Render ist die Ausnahme. Der Scrollcontainer wird bei Bedarf gesucht und
  nicht beim Mounten gemerkt: unterhalb von `lg` begrenzt `TicketFrame` nichts,
  dann scrollt das Dokument.

### Zwei Fehler, die wie „geht nicht“ aussahen

**Die Workflow-Dropdowns schickten den vorherigen Wert.** Sie lagen je in einem
`<form>` und riefen `requestSubmit()` aus `onValueChange` — das läuft **synchron**,
bevor React den neuen Wert in das versteckte native `<select>` geschrieben hat,
das Radix für die Formularteilnahme hält. „In Bearbeitung“ auf einem offenen
Ticket setzte also wieder „Offen“. Es gibt jetzt kein Formular mehr: der Wert ist
React-State, die `FormData` wird von Hand gebaut, `startTransition` umschließt den
Dispatch. Ohne die Transition warnt React und `pending` schaltet nie um.

**`statusResult ?? priorityResult ?? assignResult` maskierte spätere Ergebnisse.**
Sobald eine Statusänderung ein Ergebnis hinterlassen hatte, verdeckte es jedes
folgende — eine abgelehnte Zuweisung meldete grün „Status geändert.“. Jede Aktion
schreibt jetzt in denselben Slot, der jüngste Schreibvorgang gewinnt. Erfolg geht
zusätzlich als Toast raus: die Sidebar scrollt eigenständig, die Meldung stand
regelmäßig außerhalb des Bildes. Der Alert bleibt für den Fehlerfall, weil er dort
neben dem Bedienelement stehen soll, das abgelehnt hat.

**Der `NotificationWatcher` wiederholte sich beim Remount.** `AppHeader` wird pro
Seite gerendert, jede Navigation baut ihn also neu auf — und TanStack reicht der
neuen Instanz sofort das gecachte `["notifications"]`-Ergebnis. Mit dem Cursor nur
im Ref meldete sich eine Benachrichtigung genau auf der Seite noch einmal, auf die
sie gerade geführt hatte. Die gezeigten Keys liegen deshalb in einem
`Set` auf Modulebene: das überlebt den Remount und ist auf den Tab begrenzt, was
genau die Lebensdauer von „habe ich schon gesehen“ ist.

**Die drei Notification-Abfragen schließen den Aufrufer selbst aus**
(`c.author_id <> ?`, `created_by <> ?`, `a.actor_id <> ?`). Mit einem einzigen
Testkonto erscheint deshalb nie ein Toast — das ist Absicht und kein Defekt.

**Die zwei Detailansichten sind zwei Routen mit je eigenem Guard**, keine gemeinsame Seite
mit `isAgent`-Bedingung. Gemeinsam ist nur `components/tickets/ticket-detail.tsx` — Kopf,
Badges, Angaben. Zwei geschützte Routen sind schwerer versehentlich zu öffnen als eine
Bedingung im Markup.

**Queue-Ansichten sind Presets über `searchTickets`** (`lib/agent-views.ts`), keine eigenen
Queries. Deep-Filter kombinieren mit AND obendrauf. `parseTicketQuery` gibt deshalb
**keine undefinierten Schlüssel** zurück: `{...preset, ...filter}` würde sonst
`status: undefined` über das Preset schreiben und die Ansicht stillschweigend aufweiten —
eine Queue mit den falschen Tickets sieht aus wie eine funktionierende Queue.

**Präsenz-Farben:** 🟢 aktiv (`--success`), 🟡 inaktiv (`--warning`), ⚫ offline
(`--muted-foreground/50`). Der ursprüngliche Anforderungstext nennt für „inaktiv“ noch grau
— das ist überholt, der Nutzer hat auf gelb korrigiert.

**Rollenwechsel greifen verzögert.** Eine per SQL oder im Admin-Desk geänderte Rolle wirkt
erst nach Ablauf des Session-Cookie-Caches (60 s) oder nach einer Neuanmeldung. Beim Testen
die Sitzung neu aufbauen, sonst sieht ein frisch beförderter Agent weiter `/forbidden`.

**Ticket-Tabellen scrollen nie seitwärts, und zeigen 50 Zeilen.** Beides hängt
zusammen: eine horizontal scrollende Tabelle versteckt Status und Alter hinter
einer Geste, die mit der Maus niemand macht, und ein flaches `LIMIT 500` versteckt
alles ab dem fünfhundertsten Ticket, ohne es zu sagen. Stattdessen eine
**absorbierende Spalte**, gekürzter Titel und `hidden … table-cell` für die
Kontextspalten auf schmalen Schirmen — und `TicketPager` darunter.

**`table-fixed` mit Breite pro Spalte war der erste Versuch und hat die Seite
zerlegt.** Die Breiten summierten sich auf rund 1070 px, während die Hauptspalte der
Queue neben der Sidebar etwa 930 px hat — also wurde die einzige Spalte ohne
deklarierte Breite, der Titel, auf null gequetscht. Sein Link war damit ein
Klickziel ohne Fläche („man kann Tickets nicht mehr öffnen“), und das
`overflow-hidden` schnitt den Rest zu einem Haufen zusammen („UI-Elemente
überlappen“). Feste Breiten bräuchten Zahlen, die bei jeder Fensterbreite passen,
und die gibt es nicht.

Der Ersatz ist automatisches Layout: jede Spalte misst sich an ihrem Inhalt, die
Titelzelle trägt `w-full max-w-0 truncate` und nimmt den Rest. Sie fordert die volle
Restbreite an und bekommt gleichzeitig gesagt, ihr Maximum sei null — also gibt der
Browser ihr den Schlupf und kürzt den Inhalt, statt die Tabelle zu verbreitern.
Kappungen von Adresse, Bearbeiter und Standort sitzen auf einem inneren `<span>`:
ein `max-width` auf einem `<td>` ist im automatischen Layout nur ein Vorschlag.

- **`countSearchTickets` und `searchTickets` teilen sich `ticketWhere`.** Nicht aus
  Ordnungsliebe: die erste Klausel darin ist die Scope-Klausel, und zwei Kopien
  wären zwei Orte, an denen „ein Melder sieht nur seine eigenen“ auseinanderläuft.
  Eine Gesamtzahl, die Zeilen mitzählt, die die Liste verweigert, ist eine Auskunft
  darüber, wie viele fremde Tickets existieren.
- **Erst zählen, dann `pageOffset`.** Wer auf Seite vier steht und filtert, bekommt
  die letzte existierende Seite; ein ungeklemmter Offset liefert eine leere
  Tabelle, und die liest sich als „kein Ticket passt“.
- **Sortieren wirft `page` weg.** Seite vier der neuen Reihenfolge hat mit Seite
  vier der alten nichts zu tun.
- **Zähler in den Überschriften nutzen `total`, nicht `tickets.length`** — letzteres
  ist jetzt die Seitengröße.
- **`Table` hat ein `containerClassName` bekommen.** Das `overflow-x-auto` des
  Primitives ist hart verdrahtet und wird mit keinem Prop gemerged; ohne den Zusatz
  konnte ein Aufrufer nicht sagen, dass er nicht scrollen will. Default unverändert.
- **Die Sidebar-Spalte der Queue existiert nur, wenn etwas darin steht.** Ein fest
  deklariertes `1fr 20rem` reservierte auf einer Instanz mit beiden
  Sidebar-Modulen aus 320 px Nichts — und nahm die einer Tabelle weg, die genau
  deshalb nicht seitwärts scrollen soll.

**Der `AppHeader` ist `max-w-7xl`, so breit wie die breiteste Seite darunter.** Bei
`max-w-6xl` war er 128 px schmaler als Queue, Statistiken und beide
Ticketansichten; auf einem breiten Schirm saß das Logo sichtbar eingerückt gegenüber
der Überschrift darunter. Schmalere Seiten zentrieren sich darin, was eine
Kopfleiste tun soll — der Defekt war nur, dass der Header der *schmalere* von
beiden war. Zwei Bedienelemente derselben Ordnung in einer Zeile sind exakt gleich
hoch: der Zuständigkeits-Switcher der Queue trägt `h-11` wie die Pillen daneben,
sonst misst er sich aus `p-1` plus `h-9` plus Rahmen auf zwei Pixel mehr.

**Scope-Regel für alles, was Tickets listet:** Die Sichtbarkeit kommt aus der Rolle und wird
in der SQL-Klausel gesetzt, bevor irgendein Filter greift. Ein Query-Parameter darf
**verengen** (`?scope=own`, `ownOnly`), nie erweitern. Muster in `searchTickets`
(`lib/tickets.ts`) und `app/api/tickets/route.ts`.

Weiter offen und **nicht** Teil der fünf Parts: echtes OCR für gescannte Dokumente per
Tesseract — bräuchte `pytesseract` plus `tesseract-ocr-deu` im Backend-Image und sprengt
damit das Vier-Pakete-Limit.

## Nachrichten korrigieren und zurückziehen

**Strg+Enter sendet, Enter nicht.** Auf dem Formular statt auf jedem Editor, also
aus Textarea und Rich-Text gleichermaßen. Blankes Enter absichtlich nicht: hier
stehen mehrzeilige Antworten mit Schritten drin, und ein Enter, das absendet,
macht aus jeder nummerierten Liste eine halbe Nachricht — im Postfach des Kunden.

**Die beiden Knöpfe stecken in einem Drei-Punkte-Menü oben rechts in der Bubble.**
Vorher standen sie als zwei Pillen samt Countdown **unter** jeder eigenen
Nachricht — auf einem Verlauf mit zwanzig Antworten zwanzig Zeilen Bedienelemente
in genau der Region, die dem Gespräch gehört. Das ist derselbe Platz, um den es
beim Chat-First-Layout die ganze Zeit geht.

- **`MessageMenu` und `MessageEditor` sind zwei Komponenten**, weil sie an zwei
  Stellen gezeichnet werden: das Menü in den Kopf der Bubble, der Editor **anstelle**
  des Textes. `ChatBubble` hat dafür zwei Slots (`menu`, `editor`) statt des alten
  `actions`.
- **Welche Nachricht bearbeitet wird, ist State in `TicketMessages`.** Menü und
  Editor sind Geschwister in zwei Slots — das eine, was sie teilen, kann in keinem
  von beiden liegen. Eine Id und keine Menge: zwei Nachrichten gleichzeitig zu
  bearbeiten macht niemand, und es hieße zwei halbe Entwürfe, die den
  `router.refresh()` des Live-Polls überleben.
- **Der Editor ersetzt den Text, statt darunter zu stehen.** Vorher stand die
  gespeicherte Fassung über einem Feld mit denselben Worten — die Bubble zeigte die
  Nachricht zweimal, und keine der beiden sagte, welche gespeichert wird.
- **Zurückziehen läuft ohne `<form>`.** Ein Formular in einem Menüeintrag würde über
  ein Element abschicken, das Radix beim Auswählen abbaut; stattdessen `FormData` von
  Hand und `startTransition`, sonst warnt React und `pending` schaltet nie um.
- **`canEdit` wird am Editor erneut geprüft**, nicht nur am Menüeintrag: das Flag
  kann fallen, während ein Ticket offen ist, und ein stehengelassenes Formular
  postete in eine Action, die es ablehnt.

**Bearbeiten ist Textänderung, sonst nichts** (`feature_message_editing`). Nur der
Verfasser, nie ein Agent an den Worten eines Melders. Ein Verlauf, den jemand
anderes umschreiben kann, ist kein Verlauf; das Werkzeug für eine Nachricht, die
weg muss, ist Löschen — das hinterlässt eine Lücke statt einer Fälschung. Die
Sichtbarkeit ist ebenfalls nicht änderbar: eine öffentliche Antwort nachträglich
intern zu machen macht sie nicht ungesendet.

`edited_at` wird an der Nachricht angezeigt. Eine Nachricht, deren Text sich
geändert hat, nachdem jemand darauf geantwortet hat, ist eine andere Nachricht —
und wer die Antwort liest, muss das sehen können. Unveränderter Text ist keine
Bearbeitung und setzt den Stempel nicht.

**15 Sekunden zum Zurückziehen** (`feature_message_retract`), Konstante in
`lib/retract-window.ts` — **kein** `server-only`, weil Countdown und Prüfung
dieselbe Zahl brauchen. Geprüft wird serverseitig gegen den gespeicherten
Zeitstempel; der Countdown im Browser ist Höflichkeit, keine Regel. Bewusst nicht
konfigurierbar: bei zehn Minuten würde man anbieten, eine Nachricht zu löschen,
auf die schon jemand reagiert hat.

**Eine Benachrichtigungsmail holt das nicht zurück.** `addCommentAction` sendet
sofort. Jede Benachrichtigung um 15 s zu verzögern, um die Lücke zu schließen,
machte das ganze System für einen seltenen Fall langsamer — die Rücknahme ist
stattdessen ehrlich darüber, was sie tut.

**Ticket zurückziehen** ist reine Melder-Sache und nur, solange `open` **und**
nicht zugewiesen. Sobald jemand es übernommen hat, ist Arbeit passiert. Nicht an
das 15-Sekunden-Fenster gekoppelt: „habe ich selbst gefunden" ist eine überlegte
Entscheidung, und sie in dieselben Sekunden zu zwängen hieße, den ehrlichen Weg
unattraktiv zu machen.

**Die Erstnachricht hat keine Aktionen.** Sie ist zur Renderzeit aus dem Payload
abgeleitet; sie zu ändern hieße, eine gespeicherte Formularantwort umzuschreiben —
denselben Wert, über den das Ticket durchsucht und ausgewertet wird.
`isSyntheticOpening` ist der Test.

## Anhänge im Verlauf: klicken, groß sehen, herunterladen

`AttachmentViewer` umschließt die ganze Nachrichtenliste. Ein Klick auf ein
eingebettetes Bild oder auf eine PDF-Datei öffnet sie in einem Dialog in voller
Größe, mit dem Download-Knopf daneben.

- **Ereignis-Delegation, weil das Markup nicht unseres ist.** Ein Nachrichtentext
  ist gespeichertes HTML über `dangerouslySetInnerHTML` — es gibt kein Element, an
  das ein `onClick` gehängt werden könnte, und eines einzuziehen hieße, das
  gespeicherte Markup bei jedem Rendern umzuschreiben. Ein Handler auf der Hülle
  sieht dieselben Ereignisse und deckt auch eine gemailte Nachricht ab, deren
  Markup diese Anwendung nie geschrieben hat.
- **Erkannt wird nur `<img>` oder `<a>` auf `/api/uploads/<id>`.** Alles andere
  behält seinen gewöhnlichen Download: eine .docx hat keine Vorschau, und den Klick
  abzufangen, um das zu sagen, ersetzte einen funktionierenden Download durch einen
  Dialog, der sich selbst erklärt.
- **Klicks mit Modifiertaste bleiben unberührt.** Strg-Klick heißt weiter „neuer
  Tab"; ein Viewer, der das verschluckt, ist einer, den man umgeht.
- **`?inline=1` gilt jetzt auch für PDF** (`isInlineViewable`, `lib/storage.ts`).
  Das ist die Route-Seite derselben Funktion — ohne sie hätte der Dialog nichts zu
  zeigen. Begründung in AGENTS.md unter „Anhänge".
- **Der Browser-Viewer statt pdf.js.** Ein Megabyte JavaScript, um etwas
  nachzubauen, das jedes Zielbrowser mitbringt — und es läse dieselbe Route.

**Die Büroklammer nahm nur Bilder.** `uploadAndInsert` filterte alles andere
lautlos weg: eine ausgewählte PDF war weg, ohne Meldung, und die Antwort ging ohne
das Dokument raus, um das es ging. Jetzt geht hoch, was gewählt wurde — Bilder als
`<img>`, alles andere als Link mit dem Dateinamen, in eigenem Absatz plus einem
leeren dahinter (sonst bleibt der Cursor in der Link-Mark und das nächste Wort wird
Teil des Links). Die Allow-List und die lesbare Ablehnung stehen im Server.

**`uploadIdsInHtml` liest deshalb auch Anker, nicht nur Bilder.** Sonst bliebe die
Upload-Zeile ungebunden an das Ticket, und `openUploadFor` antwortete für alle
außer Autor und Agenten mit 404 — der Melder bekäme einen Link in seinem eigenen
Ticket, der sich nicht öffnen lässt. In `npm test` abgedeckt.

## Geteiltes: Dateien und Links an einem Ort

`lib/ticket-resources.ts` (kein `server-only`, in `npm test`) zieht die Links aus
den Nachrichtentexten, `listUploadsForTicket` die Dateien. Beim Agenten ein
Sidebar-Abschnitt, beim Melder ein zugeklapptes Accordion; beide rendern `null`,
wenn nichts da ist.

- **Gebaut aus dem sichtbarkeitsgefilterten Verlauf.** Ein Link aus einer internen
  Notiz darf nicht in der Melderliste landen — deshalb bekommt `collectLinks`
  `comments`, nicht den Rohbestand.
- **Zweites Schema-Gate.** Der Sanitizer lehnt `javascript:` schon beim Schreiben
  ab; hier steht die Prüfung noch einmal, weil dieses Panel Text aus Nachrichten
  in eine Liste von Klickzielen verwandelt.
- **Ein Link, so oft er auch zitiert wird.** Dedupliziert auf den href, behalten
  wird die erste Nennung — deren Autor und Zeitpunkt bedeuten etwas.
- **`target="_blank"` mit `noopener noreferrer`.** Manche dieser Adressen hat
  geschrieben, wer per Mail hereingekommen ist.
- Eine Datei zu listen macht sie nicht lesbar: `/api/uploads/[fileId]` prüft pro
  Anfrage weiter selbst.

## Vorlagen: `{{kunde.vorname}}`

`fillCannedResponse` löst beide Schreibweisen auf. `{{kunde.vorname}}`,
`{{kunde.name}}`, `{{agent.vorname}}`, `{{agent.name}}`, `{{ticket.id}}`,
`{{ticket.kategorie}}` — und weiterhin `{reporter_name}`, `{agent_name}`,
`{ticket_number}`.

**Die alte Form bleibt, und zwar nicht aus Bequemlichkeit.** Vorlagen mit
`{reporter_name}` liegen auf jeder bestehenden Instanz in `mits_setting`. Sie
fallen zu lassen hieße, das literale `{reporter_name}` an einen Kunden zu mailen
— die schlechteste denkbare Art, eine Syntax abzulösen.

**`templateValuesFor` ist der einzige Auflöser** (`lib/template-values.ts`,
`server-only`). Vorher bauten die Baustein-Auswahl und der Makro-Runner das
Objekt je selbst, drei Felder, und waren schon uneins darüber, was
`reporter_name` heißt. Bei sechs Feldern mit einer Anrede darunter sind zwei
handgebaute Objekte zwei verschiedene Arten, dieselbe Person anzusprechen.

- **Aufgelöst wird auf dem Server.** Der gefüllte Text erreicht den Browser, die
  Eingaben nicht. Dieselbe Regel wie bei der KI-Triage.
- **Der Meldername kommt über die Id**, nicht über `created_by_email`. Bei einem
  Mail-Ticket sind die beiden absichtlich verschieden.
- **`firstNameOf` teilt eine Adresse nicht.** Jemanden mit einem verstümmelten
  Stück seiner E-Mail zu begrüßen ist schlechter als mit der Adresse.
- **Ein unbekannter Token bleibt stehen.** Ein Admin, der sich vertippt hat, sieht
  ihn in der Vorschau, statt später ein Loch in einer gesendeten Nachricht zu
  finden.
- **Makros stehen im selben `/`-Menü** wie die Bausteine, als eigene Gruppe
  markiert: ein Baustein fügt Text ein, ein Makro ändert zusätzlich Felder und
  sendet unter Umständen. Zwei Menüs für eine Geste hieße raten, in welchem der
  gesuchte Eintrag liegt. Pfeiltasten und Type-ahead kommen vom Radix-Primitive.
