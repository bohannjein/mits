---
paths:
  - "src/lib/team.ts"
  - "src/lib/team-settings.ts"
  - "src/app/mits/team/**"
  - "src/app/admin/settings/team/**"
  - "src/components/dashboard/team-board.tsx"
  - "src/components/admin/team-settings-form.tsx"
---

# Team-Übersicht: Rückstand, Auslastung, Präsenz

`/mits/team`, hinter `feature_team_overview` (an per Default) und dem Bereich
`mits_team`. Eine Seite, drei Blöcke: was liegen bleibt, wer wie viel davon
hält, und wer gerade da ist.

## Drei Achsen, drei Fragen

Die naheliegende Umsetzung wäre ein Schalter. Es sind drei, weil sie
Verschiedenes beantworten und beim Nachsehen sonst die falsche Stelle
angeschaut wird:

| Achse | Wo | Frage |
|---|---|---|
| `feature_team_overview` | `/admin/settings/features` | Gibt es das Modul auf dieser Instanz? |
| `NavArea` `mits_team` | `/admin/settings/roles` | Bekommt diese Rolle die Fläche? |
| `TeamSettings` | `/admin/settings/team` | Was steht darauf? |

Ein abgeschaltetes Modul antwortet **404**, nicht mit einer leeren Seite — eine
leere Liste ist eine Aussage über den Bestand.

**Die Maske sagt, wo die Rollenfrage steht.** Wer die Sichtbarkeit je Rolle unter
„Team-Übersicht" sucht, findet dort die Schalter für die Inhalte und hält sie für
kaputt; ein Alert verlinkt deshalb auf `/admin/settings/roles`.

## Abgeschaltet heißt nicht berechnet

Jede der vier Abfragen in `lib/team.ts` hängt an ihrem Schalter. Eine
ausgeblendete Kennzahl, die trotzdem läuft, ist eine Auskunft, die weiter
entsteht — und der Unterschied zwischen „wir zeigen das nicht" und „wir erheben
das nicht" ist genau der, nach dem jemand fragt.

**Zwei Angaben sind ab Werk aus:** `show_current_ticket` und
`show_resolved_today`. Alles andere beschreibt die *Arbeit* — was liegt, wie viel
wem gehört. Diese beiden beschreiben eine *Person*, und das ist in einem Betrieb
mit Mitbestimmung nichts, was man mit einem Update bekommt. In `test:forms`
festgehalten; wer die Defaults umdreht, gibt jeder bestehenden Instanz eine
Leistungskennzahl.

**`TeamSettingsSchema` ist flach**, wie `NotificationSettingsSchema` und aus
demselben Grund: `parse({})` liefert ein vollständiges Objekt, eine Teilzeile
fällt Feld für Feld auf den Default zurück statt ganz verworfen zu werden. Ein
verworfener Parse blendete hier abgeschaltete personenbezogene Angaben wieder
ein — die eine Fehlrichtung, die niemand bemerkt.

## Vier Aggregate, keine Schleife

Die naheliegende Fassung wäre `countSearchTickets` je Agent. Das kostet auf einem
Desk mit zwölf Leuten zwölf Abfragen für eine Zahl, die eine `GROUP BY`-Zeile
liefert — bei jedem Realtime-Signal.

| Funktion | Quelle |
|---|---|
| `backlogFor` | `mits_ticket`, plus `AWAITING_REPLY_SQL` und ein Subselect auf die Kommentare |
| `loadByAgent` | ein `GROUP BY assigned_to` über die offenen Tickets |
| `resolvedToday` | `mits_audit_log`, `GROUP BY actor_id` |
| `currentWork` | `mits_audit_log`, jüngste Zeile je Akteur im Fenster |

**`AWAITING_REPLY_SQL` liegt in `lib/tickets.ts` auf Modulebene und wird
importiert.** Der Marker in der Queue-Zeile und die Rückstandszahl hier müssen
dieselbe Menge zählen; zwei Kopien wären zwei Definitionen von „wir sind dran",
und die Abweichung fiele erst auf, wenn jemand die Zahlen nebeneinander legt.

⚠️ **Der Ausdruck nennt `mits_ticket` beim Namen.** Ein Aufrufer, der
`FROM mits_ticket t` schreibt, bekommt einen SQL-Fehler — die richtige Richtung
für einen Fehler, aber es kostet eine Minute, wenn man es nicht weiß.

**`teamResolvedToday` ist nicht `resolvedPerAgent`.** Letzteres
(`lib/analytics/queries.ts`) hat `LIMIT TOP_N = 8`, weil es dort ein Ranking ist
und acht Zeilen die Aussage sind. Hier ist es eine Zeile pro anwesender Person,
und ein Deckel schnitte ab elf Agenten jemanden ab — mit einer Null, die wie ein
Arbeitstag ohne Abschluss aussieht.

**`IN ('closed', 'resolved')` bleibt**, weil der Audit-Log nicht migriert wird.
Für ein Tagesfenster fast immer belanglos und genau deshalb die Stelle, an der
man es vergisst.

**„Arbeitet gerade an" wird abgeleitet, nicht geschrieben.** Eine Spalte an
`mits_presence` wäre ein zweiter Schreiber, den der nächste Mutationspfad
vergisst; das Fehlerbild ist ein Agent, der laut Übersicht seit Stunden am selben
Ticket sitzt, das er längst geschlossen hat. Der Audit-Log trägt es bereits —
`comment_added` steht dort, eine Antwort zählt also mit.

**Zwei neue Indizes**, beide in `lib/db/sqlite.ts`:
`idx_mits_audit_actor (actor_id, created_at)` — der vorhandene steht auf
`(ticket_id, created_at)` und ist für „was hat dieser Akteur zuletzt getan"
wertlos; `mits_audit_log` ist die einzige Tabelle im Schema, die nur wächst.
Dazu `idx_mits_ticket_assigned (assigned_to, status)`, partiell.

## Gefiltert wird in JavaScript, nicht in SQL

`listPresence()` liefert **alle** Konten, auch Melder. Gefiltert wird mit
`canViewBoard` nach dem Lesen und nicht als `WHERE role IN ('agent','admin')`:
ein Konto, dessen Zeile noch `technician` sagt — aus einem Backup von vor der
Umbenennung —, ist erst nach `toRole` ein Agent. Ein SQL-Filter überginge es, und
das Fehlerbild wäre eine Person, die in der Queue arbeitet und in der
Team-Übersicht nicht vorkommt. Dieselbe Falle, für die `LEGACY_ROLES` existiert.

## Kapazität

Instanzwert in `TeamSettings.default_capacity`, Override je Konto als
`mits_setting`-Schlüssel `team_capacity:<userId>` — dieselbe Bauart wie
`agent_view:<userId>`. Kein `z.record`, keine Migration, und zwei Masken
überschreiben sich nicht gegenseitig einen Abschnitt.

**Kein Eintrag heißt „nimm den Instanzwert", nicht „Kapazität null".** Der
Unterschied ist, ob ein frisch angelegtes Konto denselben Maßstab bekommt wie die
anderen oder als dauerhaft überlastet erscheint. Im Formular ist ein leeres Feld
deshalb ein gültiger Zustand und kein `0`.

**Der Balken zählt Tickets, er gewichtet nicht.** Eine gewichtete Last (kritisch
= 8, niedrig = 1) wäre genauer und nicht nachrechenbar; die
Prioritätsaufschlüsselung darunter sagt dasselbe und lügt nicht. Wer „14/12"
sieht, kann zwölf zählen.

**`loadRatio` und `isOverloaded` liegen in `types/mits.ts`**, nicht in
`lib/team.ts` — dieselbe Begründung wie bei `presenceStateFor`: das Bauteil, das
den Balken zeichnet, darf kein `server-only`-Modul importieren, und die
Division durch null gehört in `test:forms`. `capacity = 0` heißt „kein Maßstab",
und `14/0` wäre `Infinity` — im Markup eine Breite, die der Browser als `NaN%`
verwirft und still auf null setzt. Der Balken sähe dann bei der am stärksten
belasteten Person am leersten aus.

## Darstellung

**Eine Server-Komponente.** Die Ausnahme ist das Statistik-Panel, und ihr Grund —
Charts, die bei jedem Tick neu mounten — gilt hier nicht. Damit läuft die
Zeitrechnung serverseitig, und es gibt kein `Date.now()` im Browser, das nach der
Hydration anders antwortet als beim Rendern.

**`QueueLive` wird wiederverwendet, nicht nachgebaut.** Dasselbe `queue`-Signal,
dasselbe 1,5-Sekunden-Fenster, derselbe ETag-Ersatz. Die Folge, ehrlich benannt:
**Präsenz allein bewegt nichts** — der Heartbeat veröffentlicht kein Signal, ein
Kollege, der sich nur anmeldet, erscheint erst mit der nächsten Aktualisierung.
Ein eigenes Signal dafür hieße, den Bus im 150-Sekunden-Takt jeder offenen
Sitzung zu befeuern, für einen Punkt, der die Farbe wechselt.

**Präsenz ist kein eigener Block, sondern der Punkt an der Zeile.** Eine zweite
Namensliste neben der ersten wäre dieselbe Information zweimal, und „ist der da,
dem das gehört" hängt an genau der Zeile mit der Last. Farben unverändert: grün
aktiv, gelb inaktiv, grau offline, plus `sr-only`-Text — Farbe allein ist das
eine Signal, das ein rot-grün-blinder Leser verliert.

**Eine Kachel verlinkt nur, wenn es den Filter wirklich gibt.** „Unzugewiesen"
führt auf `?scope=pool&view=inbox`, „kritisch offen" auf `?priority=critical`.
„Wartet auf uns" und „ohne Bewegung" sind abgeleitete Mengen ohne Queue-Filter
und bleiben ohne Link — eine Kachel, die „7" sagt und auf dreiundzwanzig Zeilen
führt, ist schlechter als eine ohne Link.

**Die Agentenzeile verlinkt mit `scope=pool`, nicht `mine`.** „Mein Bereich" ist
der eingeloggte Agent; gemeint ist der aus der Zeile. `assignedTo` als
Deep-Filter legt sich über das Preset und verengt es — die Richtung, die
`parseTicketQuery` erlaubt.

**Sortiert nach Last absteigend, bei Gleichstand nach Namen.** Beide Enden sind
die interessanten: oben, wer zu viel hat, unten, wer etwas nehmen kann. Nach
Präsenz zu sortieren wäre die Reihenfolge der Sidebar-Liste und beantwortet eine
andere Frage — und wer offline ist, verschwände unter den Leuten, deren Tickets
trotzdem liegen.

## Speichern

Ein Formular, als JSON in einem versteckten Feld — wie bei den Modulen. Das
umgeht die Falle, an der eine Schaltermaske sonst scheitert: ein nicht angehakter
Schalter wird nicht gesendet, „aus" ist also von „war nicht im Formular" nicht zu
unterscheiden, und jedes Speichern der einen Sektion löschte die Schalter der
anderen — mit Erfolgsmeldung.

**Die Kapazitäten werden von Hand geparst und gegen den Kontenbestand
gefiltert**, nicht per `z.record`. Zwei Gründe: `z.record` mit einem Enum ist in
Zod 4 exhaustiv und lehnt eine Teilmenge ab — und eine abgelehnte Zeile nähme die
Schalter mit, die gerade gespeichert wurden. Der Filter ist zusätzlich die
Zugriffsgrenze: ohne ihn schriebe ein handgebauter Request eine Setting-Zeile für
jede Id, die er sich ausdenkt.
