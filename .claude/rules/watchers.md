---
paths:
  - "src/lib/ticket-watchers.ts"
  - "src/lib/today.ts"
  - "src/app/actions/watchers.ts"
  - "src/app/mits/today/**"
  - "src/components/tickets/watch-button.tsx"
---

# Beobachter, `@`-Erwähnungen und „Mein Tag"

`feature_ticket_watchers` (an per Default) deckt die ersten beiden ab. „Mein Tag"
hat kein Flag — es ist eine Sortierung über Dinge, die der Leser ohnehin sieht.

## Der Gewinn ist Ruhe, nicht das Abo

Ein Agent bekommt heute eine Einblendung für **jede** Antwort auf **jedes**
Ticket der Instanz: der `reply`-Zweig in `lib/notifications.ts` hat für Personal
keine Einschränkung. Ein Abo allein ändert daran nichts — es *ermöglicht* den
Zwischenzustand, den es vorher nicht gab.

`reply_scope` in den Benachrichtigungseinstellungen ist die Stelle, an der ein
Desk ihn wählt: **alle Tickets** (Default, unverändertes Verhalten) oder
**zugewiesene, beobachtete und eigene**. Der Default bleibt `all`, damit ein
Update niemandem still Meldungen wegnimmt.

**Die Wahl erscheint nur mit dem Modul.** Ohne Abos wäre `mine` eine
Stummschaltung ohne Ausgang: die Klausel fragt nach „zugewiesen oder
beobachtet", und ohne automatisches Folgen bliebe die zweite Hälfte für immer
leer.

## Automatisch folgen, sonst folgt niemand

Drei Stellen legen ein Abo an:

| Auslöser | Wo |
|---|---|
| Zuweisung | `assignTicket` (`lib/tickets.ts`) |
| eigener Beitrag, nur Personal | `addComment` (`lib/ticket-comments.ts`) |
| Erwähnung | `recordMentions` (`lib/ticket-watchers.ts`) |

Die zweite steht in `addComment` und nicht in der Action, aus demselben Grund
wie der Ballbesitz eine Zeile darüber: der Mail-Ingest legt Beiträge ohne Server
Action ab, und ein Agent, der per Mail antwortet, hat genauso etwas zu diesem
Ticket gesagt. **`isAgent` und nicht die Rolle des Kontos** — der Ingest erzwingt
dort `0`, eine gemailte Kundenantwort unter dem Auffang-Konto legt also kein Abo
an.

**Die Gegenrichtung fehlt absichtlich.** Eine entzogene Zuweisung löscht das Abo
nicht: wer ein Ticket abgibt, will meist wissen, wie es ausgeht, und der Knopf am
Ticket ist der Weg, das zu beenden.

## `lib/ticket-watchers.ts` ist eine Senke

⚠️ Sie importiert `lib/tickets.ts` **nicht**. Das ist der sichtbare Unterschied
zu `lib/ticket-pins.ts`, das `getTicketFor` selbst ruft — dort geht der Pfeil nur
in eine Richtung, hier ruft `assignTicket` seinerseits `watchTicket`. Beides
zusammen wäre ein Importzyklus.

Die Zugriffsprüfung liegt deshalb eine Ebene höher, in `app/actions/watchers.ts`.
Die Tür ist dieselbe: `getTicketFor` antwortet für „gibt es nicht" und „darfst du
nicht sehen" gleich.

## Die `watched`-Spalte

`searchTickets` liefert sie je Leser, wie `pinned`. Dazu der Filter `watchedBy`
für „Mein Tag".

⚠️ **Der Ausdruck steht direkt hinter `pinned`, sein Parameter direkt hinter
dessen Parameter.** Alles in dieser SELECT-Liste bindet positionsgenau; ein
Ausdruck, der oberhalb eingefügt wird, verschiebt jeden folgenden Parameter — und
das Ergebnis ist gültiges SQL, das eine andere Frage beantwortet. Weder
`typecheck` noch `build` führt ein Statement aus. Dagegen steht der Test „die
watched-Spalte meldet den Leser, nicht die Zeile" in `scripts/verify-db.mts`.

`watchedBy` ist eine Benutzer-Id und wird deshalb **nie** aus dem Query-String
gelesen — ein Wert von dort wäre ein Leser, der in die Abo-Liste eines anderen
sieht.

## Erwähnungen

`mits_comment_mention (comment_id, user_id)`, Paar als Primärschlüssel.

**Das ist keine Zustelltabelle** und widerspricht der Doktrin in
`lib/notifications.ts` nicht: kein Zustellflag, kein Aufräumjob, keine Zeile pro
Person pro Ereignis. Es ist eine Tatsache über den Beitrag, wie `mits_ticket_ci`
eine über das Ticket ist. Abgeleitet bleibt die **Meldung** — `listNotifications`
joint über `created_at > since`.

**Der Text trägt den Namen, die Tabelle die Id.** Den Namen später aus dem Text
zurückzulesen wäre die zweite Wahrheit und bei zwei Kolleginnen mit demselben
Vornamen falsch — in die Richtung, in der jemand eine Meldung über ein Gespräch
bekommt, in dem er nicht gemeint war.

**Keine neue Abhängigkeit.** `@tiptap/extension-mention` bleibt draußen; der
Composer bekommt einen Knopf neben „Bausteine", der den Anzeigenamen einfügt und
die Id in einem versteckten Feld sammelt. Ein `@`-Kürzel im Feld wie das `/`
daneben bräuchte eine Suggestion-Erweiterung — eine Abhängigkeit für eine Geste,
die der Knopf ohne sie erledigt.

**Abgelegt wird nach dem Schreiben, nicht darin.** `addComment` hat vier
Aufrufer, drei davon können niemanden erwähnen; ein zusätzlicher Parameter wäre
dort ein Feld, das immer leer ist. Die Folge ist ausgesprochen: scheitert der
Schritt, steht der Beitrag trotzdem und es fehlt eine Meldung. Andersherum wäre
die teurere Reihenfolge.

**Die Ids werden gegen den Kontenbestand geprüft** (`canViewBoard`, ohne den
Autor). Ohne das könnte ein handgebauter Request eine Meldung an ein beliebiges
Konto auslösen.

**Eine Erwähnung ersetzt die Antwort-Meldung, sie kommt nicht dazu.** „Bea hat
geantwortet" und „Bea hat dich genannt" über derselben Nachricht sind zwei
Einblendungen für ein Ereignis, und die zweite ist die genauere. Umgesetzt als
`NOT EXISTS` im `reply`-Zweig.

**Fünfter Kanal `mention`**, `staffOnly`. Die Regel an `NOTIFICATION_CHANNELS`
gilt: einen Kanal zu erfinden heißt, die Abfrage zu schreiben, die ihn findet.

### Ein Fehler, der dabei aufgefallen ist

`deterministicDigest` hatte die Kanalliste **von Hand**: `["reply", "ticket",
"assigned"]`. `reminder` fehlte darin schon vorher, ein Stapel aus lauter
fälligen Erinnerungen ergab also die Überschrift „Während deiner Abwesenheit: "
— mit nichts dahinter. Die Schleife läuft jetzt über `NOTIFICATION_CHANNELS`;
ein neuer Kanal hat dort nichts nachzutragen. In `test:forms` festgehalten.

## „Mein Tag"

`/mits/today`, `lib/today.ts`. **Keine neue Tabelle, keine neue Abfrage** — eine
Zusammensetzung aus `filterFor`, `searchTickets` und `listUpcomingReminders`.

**Eine Liste, nicht fünf Abschnitte mit eigener Sortierung.** Überfälliges unter
„steht noch an" ist die eine Reihenfolge, die eine Aufgabenliste nicht haben darf
— dieselbe Regel, aus der das Erinnerungs-Widget seine beiden Hälften nicht
trennt. Der Grund steht als Etikett an der Zeile, damit die Ordnung
nachvollziehbar bleibt.

**Ein Ticket erscheint einmal**, mit seinem dringendsten Grund. Die Rangfolge
*ist* die Reihenfolge von `TODAY_REASONS`: Erinnerung, wartet auf uns,
beobachtet, angeheftet, Pool. Zweimal dieselbe Zeile mit zwei Etiketten wäre eine
Liste, deren Länge nichts sagt.

**Der Pool ist gedeckelt und steht zuletzt.** Er ist das Angebot, nicht die
Pflicht — ungedeckelt wäre „Mein Tag" auf einer belasteten Instanz eine Kopie des
Eingangs mit einer irreführenden Überschrift. Die Gesamtzahl steht als Link
darunter.

**Kein Flag und kein Bereich.** Die Seite zeigt ausschließlich, was der Leser
ohnehin sehen darf, in einer anderen Reihenfolge; ein Schalter dafür wäre einer
für eine Sortierung. Was fehlt, fehlt mit seinem Modul: ohne Erinnerungen keine
Erinnerungszeilen, ohne Beobachter keine beobachteten.

**Die leere Liste ist eine gute Nachricht** und wird so formuliert. „Keine
Einträge" ist der Satz, den eine kaputte Abfrage produziert.
