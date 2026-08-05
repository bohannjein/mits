---
paths:
  - "src/lib/ticket-categories.ts"
  - "src/lib/triage-rules.ts"
  - "src/lib/services/auto-triage.ts"
  - "src/app/admin/categories/**"
  - "src/app/admin/settings/routing/**"
  - "src/components/admin/category-tree-form.tsx"
  - "src/components/admin/triage-rules-form.tsx"
  - "src/components/tickets/queue-filter-bar.tsx"
  - "src/components/tickets/intent-tiles.tsx"
  - "src/components/tickets/re-route-modal.tsx"
---

# Kategorien, kaskadierender Filter, Smart-Routing

Drei Dinge, die dieselbe Spalte benutzen: `mits_ticket.category_id`. Zwei Flags —
`feature_ticket_categories` (an) und `feature_smart_routing` (**aus**).

**Warum das Routing-Flag aus ist und die anderen an sind:** die beiden anderen
sind untätig, bis jemand sie benutzt — ohne Kategorien kein Filter, ohne
Erinnerungen ein leeres Widget. Smart-Routing *schreibt* an eingehende Tickets,
und das muss eine Entscheidung sein, die jemand getroffen hat, statt etwas, das
nach einem Update anfängt zu passieren.

## Die Wurzel hat einen leeren Elternteil, nicht `NULL`

`mits_ticket_category.parent_id` ist `NOT NULL DEFAULT ''`, und daran hängt die
Eindeutigkeit. SQL zählt NULLs in einem Unique-Index als verschieden, ein
`UNIQUE (parent_id, name)` über eine nullbare Spalte nähme also „Hardware"
zweimal als Wurzel an — genau das Duplikat, das zählt, weil der kaskadierende
Filter dann zwei gleich beschriftete Einträge zeigt und jeder die Hälfte der
Tickets trägt. Der Leerstring ist ein Wert und kollidiert mit sich selbst.

Folge: **kein selbstreferenzierender Fremdschlüssel**, denn `''` ist keine Zeile.
Der Waisenschutz liegt deshalb in `replaceCategories` und läuft vor dem ersten
Schreibvorgang — eine Unterkategorie ohne Hauptkategorie würde sonst *unsichtbar*
gespeichert: `listCategoryTree` zeigt Wurzeln und deren Kinder, eine Zeile ohne
Elternteil rendert also nirgends, und ein Admin sähe seinen Eintrag beim Speichern
verschwinden.

**Kein Fremdschlüssel von `mits_ticket.category_id` aus**, dieselbe Regel wie bei
`mits_location`: eine gelöschte Kategorie darf ihre Tickets nicht mitnehmen.
`categoryPath` gibt für eine unbekannte Id eine leere Liste zurück, das Badge
rendert dann nichts — statt das Wort „unbekannt", das sich liest wie ein Wert, den
jemand gewählt hat.

## Gespeichert wird das Blatt, gefiltert wird der Teilbaum

Ein Blatt impliziert seine Vorfahren; beides zu speichern wären zwei Spalten, die
sich widersprechen können. `descendantCategoryIds` klappt beim Lesen auf, also
findet „Hardware" auch die Tickets unter „Hardware / Notebooks" — ohne das wäre die
Elternebene ein Dropdown-Eintrag, der auf jeder Instanz mit Unterkategorien nichts
findet.

- **Aufgeklappt wird in JavaScript, nicht in einer rekursiven CTE.** Die Tabelle
  hat Dutzende Zeilen und wird bei jedem Queue-Render ohnehin gelesen; und hier
  liegt die Zyklus-Sicherung. Eine handeditierte Elternschleife lässt eine
  rekursive CTE hängen, die Iteration bricht nach zwölf Ebenen mit einer
  abgeschnittenen Antwort ab.
- **Eine unbekannte Id ergibt sich selbst** und trifft damit nichts statt alles.
  Ein veraltetes Lesezeichen zeigt eine leere Queue, statt den Filter still
  fallenzulassen und eine breitere Liste als verengt darzustellen.
- **Zwei Query-Parameter, ein Filterfeld.** `?category=` und `?subCategory=`
  landen in `filter.categoryId`, das tiefere gewinnt. Beide zu kombinieren wäre
  „Hardware AND Notebooks", und eine handgetippte Unterkategorie einer *anderen*
  Wurzel wäre eine Abfrage, die nichts findet und wie eine leere Queue aussieht.
- **`parseTicketQuery` validiert die Ids nicht.** Es müsste dieselbe Entscheidung
  treffen wie `ticketWhere` und dafür die Datenbank lesen, in einer Funktion, die
  sonst reine String-Arbeit ist.

## Der Filter steht in der URL, nicht im State

`QueueFilterBar` liest `useSearchParams()` und schreibt per `router.push`. Kein
GET-Formular wie `TicketFilters`: in dieser Zeile gibt es nichts sonst
abzuschicken, und ein Formular bräuchte ein verstecktes Feld für jeden Parameter,
den die Seite schon in der URL hat — Reiter, Zuständigkeit, Sortierung, Seite. Eines
davon zu vergessen ist genau der Defekt, den das `carry`-Prop drüben flickt.

**In `TicketFilters` sind die beiden versteckte Felder**, nicht bedienbar. Die
Kaskade lebt an einer Stelle; ein zweites Auswahlpaar dort wären zwei Orte, die
entscheiden, welche Kinder zu welcher Wurzel gehören. Überleben müssen sie
trotzdem, weil ein GET-Formular nur seine Felder sendet.

**Jede Filteränderung wirft `page` weg.** Seite vier einer engeren Liste ist nicht
Seite vier der alten.

**Nur die Kategorie steht wieder in der Queue.** Der volle Filterblock ist weiter
weg, aus dem Grund, aus dem er ging (sechs Bedienelemente dauerhaft für eine
gelegentliche Operation). Kategorie ist die Ausnahme: so teilt ein Desk mit
Spezialisten den Tag ein, sie wird auf dem Weg hinein angefasst.

## Regeln, kein Modell

`services/auto-triage.ts` ist rein und ohne `server-only` — drei Aufrufer: der
Anlege-Pfad, die FAQ-Hinweise im Eingang, die Offline-Suite. Die Regeln selbst
liegen als JSON in `mits_setting` (`triage_rules`), wie Bausteine und Makros.

**`services/ai/routing.ts` bleibt, was es war: ein Vorschlag als Tag.** Die
Begründung dort gilt weiter — ein Modell, das Tickets still zwischen Queues
schiebt, schiebt manche falsch, und niemand weiß welche. Was hier dazukommt, ist
ein zweiter Mechanismus, der *schreiben* darf, und zwar genau deshalb: ein Admin
hat ihn geschrieben, man kann ihn nachlesen, und die Historie sagt, was er getan
hat (`category_changed`, mit dem lesbaren Pfad statt mit zwei UUIDs).

- **Was der Melder gewählt hat, gewinnt.** Die Intent-Kacheln *sind* das: jemand
  sagt „das ist ein Notebook-Problem". Eine Regel, die das überschreibt, wäre eine
  Maschine, die einem Menschen widerspricht, der die Antwort vor sich hatte. Regeln
  füllen nur die Lücke — Freitext, Mail, REST.
- **Priorität nur nach oben** (`PRIORITY_RANK`). Eine Regel, die still
  herabstuft, was jemand als dringend markiert hat, wäre die schlimmste Art
  Automatisierung: unsichtbar und einer Person widersprechend.
- **Stärke ist die Zahl *verschiedener* Treffer**, nicht deren Summe: ein Ticket,
  das achtmal „Drucker" sagt, ist ein Indiz über Drucker; eines mit „Drucker" und
  „Toner" sind zwei. Gleichstand entscheidet `order_index` — deshalb ist die
  Reihenfolge in der Maske Bedeutung und keine Zierde.
- **Die Kategorie kommt von der stärksten Regel, *die eine nennt*.** Eine Regel
  darf nur Artikel anbieten („Passwort" → zwei FAQ-Einträge, keine Kategorie); sie
  gewinnen zu lassen hieße, dass eine besser passende Einordnungsregel darunter nie
  greift. Die Artikel kommen dagegen von *allen* Treffern.
- **Prefix ab fünf Zeichen** (`KEYWORD_PREFIX_MIN`). Deutsche Komposita sind der
  ganze Grund: „Druckereinstellungen", „Notebookakku" und
  „VPN-Verbindungsproblem" sind einzelne Tokens. Darunter feuert die Regel auf
  Unbeteiligtes — „mail" auf „mailand", „netz" auf die halbe Sprache. Kein
  `includes`: das trifft über Wortgrenzen und mitten in fremden Wörtern.
- **Der Text ist Titel plus die Worte des Melders**, nicht die ganze Payload. Die
  Beschriftungen eines Formulars und sein Standortname sind Vokabular, das niemand
  geschrieben hat; dagegen zu matchen sortiert Tickets nach der Form des Formulars
  statt nach dem, was gesagt wurde.
- **Eine Regel ohne Stichworte wird beim Speichern verworfen.** Sie kann nie
  treffen, und eine Zeile in der Maske, die nichts tut, ist schlimmer als keine —
  jemand wird annehmen, dass sie funktioniert.

## Stichworte ziehen auch Artikel

Der zweite Weg in denselben Hinweisbereich im Eingang. Der lexikalische Treffer
(`services/ai/deflection.ts`) findet, was *Vokabular teilt* mit einem Artikel; das
verfehlt den Fall, den ein Admin kommen sieht: „Notebook" soll die
Notebook-Artikel hochholen, ob diese das Wort nun oft genug benutzen, um die
Schwelle zu reißen, oder nicht.

- **Eine Liste, nicht zwei.** Wenn „Notebook" Hardware/Notebooks bedeutet, sind
  die Notebook-Artikel die passenden — das zweimal zu pflegen ist, wie die beiden
  auseinanderlaufen.
- **Regel-Artikel zuerst, lexikalische füllen auf** bis `DEFLECTION_LIMIT`. Eine
  Regel ist eine Aussage, eine Token-Überlappung von 0,4 eine Messung.
- **Dedupliziert auf die Id**: ein Artikel kann genannt *und* gefunden werden, und
  dieselbe Frage zweimal liest sich als Renderfehler.
- **Beide Hälften einzeln schaltbar**: die FAQ hängt an `deflection`, die Regeln
  an `feature_smart_routing`. Ein Admin, der Stichwort-Artikel will und kein
  lexikalisches Raten, bekommt genau das.

## Intent-Kacheln

Zwei Runden Kacheln über dem Reiterstreifen in `/customer/new`: Intention, dann
Szenario. Ein Dropdown mit vierzig Blättern verlangt, das Ablagesystem des Desks
zu kennen, bevor man sein Problem beschreiben darf.

- **Die Queue-Zuordnung ist unsichtbar.** Ein Melder wählt „Notebook", gespeichert
  wird eine Kategorie-Id. Nirgends steht „Hardware / Notebooks" oder „Queue" — er
  hat keine Queue, und die Wörter laden nur zum Raten am Organigramm ein.
- **Immer überspringbar.** Eine unbeantwortete Kategorie ist eine Frage an den
  Agenten, eine erzwungene eine Wand vor einer Supportanfrage — dieselbe
  Entscheidung, die die drei Pillen im Chat-Eingang schon treffen.
- **Der Zustand liegt im Container**, nicht in der Kachel-Komponente:
  `TriModalContainer` rendert sie bei jedem Reiterwechsel neu, State im Kind
  klappte die zweite Stufe mitten in der Auswahl zusammen. Von dort wird
  `category_id` auch in den Request geschrieben, über das `null`, das die drei
  Formulare senden — sonst wären es vier Props für einen Wert, den keines besitzt.
- **Eine Wurzel ohne Kinder ist ein Blatt** und wird beim ersten Klick
  gespeichert, statt eine leere zweite Stufe zu öffnen.
- **Ein Icon-Name kommt aus der Kategoriezeile durch `iconFor`** — eine
  Allow-List, keine dynamische Auflösung: die Namen sind Admin-Eingabe, und
  dynamisch aufzulösen zöge den ganzen Lucide-Satz ins Bundle.

## Re-Route

`ArrowRightLeft`-Nachbar von Dispatch in der Action-Bar, weil es dieselbe Geste
auf ein anderes Ziel ist: Dispatch gibt das Ticket an eine Person, Re-Route an eine
Queue.

- **Der Vorschlag kommt aus den Regeln, nicht aus dem KI-Tag.** Der Tag nennt ein
  *Formular* (`passt-eher:<id>`), und es gibt keine Tabelle, die ein Formular auf
  eine Kategorie abbildet — eine hier zu erfinden hieße, aus Strings zu raten. Die
  Regeln liefern direkt eine Kategorie-Id und lassen sich nachlesen.
- **Der Vorschlag ist nicht vorausgewählt**, sondern ein Knopf, der die beiden
  Dropdowns füllt. Ein Dialog mit vorbelegter Modellantwort ist ein Dialog, den die
  meisten ohne Lesen bestätigen — dasselbe, wie das Modell schreiben zu lassen.
- **„Keine Kategorie" ist eine echte Wahl.** Ein falsch einsortiertes Ticket ist
  schlimmer als ein ehrlich unsortiertes: nur das zweite taucht auf, wenn jemand
  sucht, was noch einzuordnen ist.
- **Auf dem Anlege-Pfad wird eine unbekannte Id still auf `null` gesetzt, beim
  Re-Route abgelehnt.** Beim Anlegen kann ein veraltetes Formular sie schicken;
  beim Re-Route wählt jemand aus einer gerade gerenderten Liste, ein Fehlschlag
  heißt also „die Liste ist veraltet", und das zu sagen ist nützlicher, als das
  Ticket nirgends abzulegen.
