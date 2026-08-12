---
paths:
  - "src/lib/role-visibility.ts"
  - "src/lib/visibility-presets.ts"
  - "src/app/admin/settings/roles/**"
  - "src/components/admin/role-visibility-form.tsx"
  - "src/lib/form-schemas.ts"
  - "src/components/auth/user-menu.tsx"
  - "src/components/layout/app-header.tsx"
  - "src/components/dashboard/portal-actions.tsx"
---

# Sichtbarkeit je Rolle: welche Formulare und Bereiche wem gezeigt werden

`/admin/settings/roles`, gespeichert unter dem Setting-Key `role_visibility`.
Zwei Dimensionen je Rolle — **Formulare** (Schema-Ids) und **Bereiche**
(`NavArea`) — und beide sind per Default leer. Voreingestellt sieht jede Rolle
alles.

## Die eine Entscheidung, aus der der Rest folgt

**Gespeichert wird das Weggenommene, nicht das Erlaubte.** Ein neu angelegtes
Formular ist damit sofort für jede Rolle sichtbar. Die Gegenrichtung — eine
Liste des Erlaubten — hätte jedes im Builder veröffentlichte Formular still für
alle unsichtbar gemacht, und das Fehlerbild wäre „der Builder speichert nicht".

Daraus folgt der Rest:

- **Ein leerer, fehlender oder kaputter Eintrag heißt „alles sichtbar".**
  `getRoleVisibility` fällt auf `DEFAULT_ROLE_VISIBILITY` zurück, statt zu
  werfen. Ein handeditiertes JSON darf keiner Instanz die halbe Oberfläche
  nehmen.
- **Formular-Ids werden nicht gegen den Bestand geprüft.** Ein Formular kann aus
  dem Katalog verschwinden und zurückkommen; die Regel dazu wegzuwerfen hieße,
  es bei der Rückkehr für alle freizugeben.
- **`hidden_areas` ist `z.array(z.string())` mit Filter in der Transform**, kein
  `z.array(Enum)`. Zod 4 lehnt ein unbekanntes Element ab, und ein in einer
  späteren Version entfernter Bereichsschlüssel nähme sonst die ganze
  Konfiguration mit — inklusive der Formularregeln. Dieselbe Falle wie bei
  `widget_order` in `PortalConfigSchema`, und sie ist in `npm test` abgedeckt.

## Die eine Angabe, die etwas setzt: `default_priority`

Mit welcher Priorität ein Ticket dieser Rolle startet. Sie steht in demselben Blob
und in derselben Maske, weil es eine Angabe **pro Rolle** ist und ein zweiter
Setting-Key eine zweite Maske für dieselbe Frage wäre. Sie ist trotzdem der
Ausreißer hier: ein Wert statt einer Liste, und sie nimmt nichts weg.

**Für einen Melder ist der Wert die Obergrenze, für einen Agenten der Startwert.**
Dieselbe Einstellung, zwei Bedeutungen — deshalb sagt die Karte auf jedem Reiter
etwas anderes:

| Rolle | Wirkung in `createTicket` |
|---|---|
| `user` | geklemmt, der Entwurf kann nichts anderes durchsetzen |
| `agent` | genommen, wenn der Entwurf **keine** Priorität nennt |
| `admin` | nicht in der Maske, also `DEFAULT_TICKET_PRIORITY` |

**`MITSTicketDraftSchema.priority` ist deshalb `optional()` und nicht
`default()`.** Mit einem Default wären „hat medium gesagt" und „hat nichts gesagt"
derselbe Wert, und die Einstellung wäre für jeden Client unsichtbar, der das Feld
weglässt — also für alle. Das ist die tragende Änderung, nicht der Select in der
Maske.

**Die Rolle ist die des Anlegenden.** Für Mail-Ingest und `/api/v1/tickets` ist
das das Auffang-Konto, ein gemailtes Ticket startet also mit der Priorität *dessen*
Rolle. Willkürlich, aber harmlos: ein Agent ändert sie mit einem Klick. Anders als
beim Formular-Check (siehe unten) gibt es hier nichts abzulehnen, deshalb darf die
Regel in `createTicket` stehen.

**Eine Vorlage trägt sie nicht.** `presetRulesFor` gibt `RoleVisibilityRules`
zurück — nur die beiden Listen —, und die Aufrufstelle **mischt** statt zu
ersetzen. Eine Vorlage ist eine Aussage über Sichtbarkeit; „Personalabteilung
anwenden" darf keine Datenentscheidung mitverstellen, die drei Karten weiter unten
steht. Der Rückgabetyp ist das, was das erzwingt: ohne ihn hätte das Anwenden die
Priorität still auf den Default gesetzt.

**Der Zähler im Reiter zählt sie nicht.** Er zählt Einschränkungen, und eine
Startpriorität ist keine.

## Das Ergebnis ansehen: `/customer?preview=user|agent`

Diese Maske hatte den größten Abstand zwischen Klick und Wirkung im ganzen
System: prüfen konnte ein Admin sie nur, indem er sich ein Testkonto anlegte —
bei drei Rollen, Vorlagen und einem Dutzend Formularen.

Zwei Knöpfe oben rechts führen ins Portal in der Sicht der gewählten Rolle,
`RolePreviewBanner` sitzt darüber.

- **Die Vorschau kann nur verengen.** Gelesen wird der Parameter nur hinter
  `canAdminister`, und `isRestrictableRole` lässt nur `user` und `agent` durch —
  ein Admin ist selbst nicht einschränkbar, jede Wahl nimmt also weg.
  `?preview=admin` von einem Anwender ändert nichts: beide Prüfungen fallen durch.
- **Fremde Daten werden nicht simuliert.** Die Ticketliste bleibt die eigene. Die
  Frage lautet „welche Flächen bietet die Instanz dieser Rolle an", nicht „was
  steht bei jemand anderem drin".
- **Nur das Portal.** `/customer/new` und `/customer/tickets` haben ihre eigenen
  `requireArea`-Guards, und eine Vorschau, die durch einen Guard läuft, wäre eine
  Umleitung mit Banner.

## Admin ist nicht einschränkbar

`RESTRICTABLE_ROLES` ist `["user", "agent"]`. Die Maske liegt selbst unter
`/admin`; eine Rolle, die sich den Weg dorthin nehmen kann, sperrt die Instanz
aus — dieselbe Begründung, aus der sich der letzte Admin nicht herabstufen kann.
`roleSeesArea` und `roleSeesForm` geben für jede Rolle außerhalb der Liste `true`
zurück.

## Kein Schalter für das Zuhause einer Rolle

`/customer` und `/mits` tragen keinen `NavArea`. Sie sind das Ziel jeder
Umleitung — `requireArea` schickt auf `homeFor(role)` —, und ein abschaltbares
Ziel wäre eine Umleitungsschleife.

## Zwei Reiter hängen an Formularen, einer an einem Bereich

Der Ticketeingang hat drei Reiter, und sie werden **nicht** gleich behandelt:

| Reiter | Verschwindet, wenn |
|---|---|
| Schnellerstellung | `quick-ticket` ausgeblendet ist (`quickTicketSchemaFor` gibt `undefined`) |
| Service-Katalog | `listCatalogSchemasFor` leer ist |
| KI-Assistent | Bereich `intake_ai` aus ist |

Zwei Wege, denselben Reiter abzuschalten, wären einer zu viel — deshalb hat
„Schnellerstellung" keinen eigenen Bereichsschlüssel, sondern hängt an seinem
Formular. Der KI-Chat hat kein Formular hinter sich und deshalb den Schalter.

**Bleibt kein Reiter übrig, leitet `/customer/new` auf das Portal um.** Eine
Seite mit Überschrift und nichts darunter sieht kaputt aus, statt zu fehlen. Die
Maske warnt vorher (`IntakeWarning`), weil drei einzeln harmlose Schalter das
zusammen anrichten.

**Die Portal-Kachel „Ticket schreiben" existiert nur für diesen Fall.**
`PortalActions` hatte immer zwei Kacheln (KI, Katalog) und keine für die
Schnellerstellung — man kam über eine der beiden hinein und wechselte den
Reiter. Bleibt für eine Rolle nur die Schnellerstellung, gäbe es ohne die dritte
Kachel keinen Weg mehr ins Formular. Sie erscheint deshalb **nur**, wenn keine
der beiden anderen erscheint.

## Vorlagen

Setting-Key `visibility_presets`, eine Liste wie Textbausteine oder Makros: ganz
gelesen, ganz geschrieben, angelegt und gelöscht in derselben Maske.

**Eine Vorlage ist keine Rolle.** Sie legt eine gespeicherte Zusammenstellung auf
die Schalter *einer Rolle*, und die gilt für jedes Konto darin. „Personalabteilung"
auf `user` anzuwenden heißt: die Anwender dieser Instanz sind die
Personalabteilung. Solange es keine Zuordnung pro Konto gibt, ist das die ganze
Funktion — die Karte sagt es, weil eine Vorlage, die aussieht wie eine Rolle und
keine ist, still falsch angewendet wird.

**Fehlt die Zeile, gelten die drei mitgelieferten** (`DEFAULT_VISIBILITY_PRESETS`:
Anwender, Personalabteilung, Agent). Geschrieben wird erst beim ersten Speichern;
danach steht dort, was der Admin stehen hat — auch eine leere Liste. Genau so ist
„löschbar" gemeint: eine gelöschte Vorgabe kommt nicht beim nächsten Start
zurück. **Eine kaputte Zeile fällt auf `[]` zurück, nicht auf die Vorgaben** —
sonst erschienen gelöschte Einträge wieder, sobald jemand das JSON verunstaltet.

**Die mitgelieferten sind Positivlisten, die eigenen Momentaufnahmen.**
`PRESET_KEEP_FORMS` hält je Vorgabe die Ids, die **bleiben**; `presetRulesFor`
rechnet die Streichliste beim Anwenden gegen den aktuellen Bestand aus. Ohne das
wäre „HR sieht nur Eintritt" in dem Moment falsch, in dem jemand ein
Bestellformular baut — und zwar in die gefährliche Richtung. Eine selbst
gesicherte Vorlage speichert dagegen, was auf den Schaltern stand; alles andere
hieße, dass „gesichert" etwas anderes bedeutet als das, was man gesehen hat.

`npm test` prüft, dass jede Id in `PRESET_KEEP_FORMS` ein Formular trifft. Das
Fehlerbild sonst: die Positivliste trifft nichts, und Anwenden blendet **alles**
aus.

**Zwei Speicherknöpfe auf einer Seite, und das ist Absicht.** Vorlagen und
Sichtbarkeit liegen unter zwei Keys und werden getrennt geschrieben: eine Vorlage
anzulegen darf nicht die halb gesetzten Schalter daneben mitschreiben, und
„Anwenden" darf nicht sofort für alle gelten. Die Vorlagenliste ist State in
`RoleVisibilityForm` und nicht in der Karte — gespeichert wird immer die **ganze**
Liste, und zwei Karten mit eigenem State überschrieben sich gegenseitig die
Vorlagen der anderen Rolle.

## Wo durchgesetzt wird

Ausblenden ist keine Grenze; die Grenze liegt daneben. Beides gehört zusammen —
ein Link, der in eine Umleitung läuft, ist eine schlechtere Antwort als kein
Link, und eine Route ohne Prüfung ist Kosmetik.

| Fläche | Versteckt in | Durchgesetzt in |
|---|---|---|
| Formulare im Katalog | `listCatalogSchemasFor` | `POST /api/tickets` |
| Schnellerstellung | `quickTicketSchemaFor` | dito |
| KI-Vorschläge | `POST /api/ai/triage` filtert die Schema-Liste | dito |
| Ticketeingang | Portal-Kacheln | `requireArea("customer_new")` |
| Meine Tickets | Benutzermenü, Knopf auf `/customer/new` | `requireArea("customer_tickets")` |
| Ticket-Suche | `AppHeader` | `jumpToTicketNumber` übersprungen |
| CMDB | Knopf in der Queue | `requireArea` auf drei Seiten + `guardCMDBRequest` |
| Statistiken | Benutzermenü, Link an `StatsTiles` | `requireArea` + `GET /api/analytics` |

**Der Formular-Check sitzt in `POST /api/tickets`, nicht in `createTicket`.**
Das ist die eine Tür, durch die ein Mensch ein *gewähltes* Formular schickt. Die
beiden anderen Aufrufer — `/api/v1/tickets` und der Mail-Ingest — legen unter
einem Auffang-Konto ab, dessen Rolle mit der Sache nichts zu tun hat. Eine Regel
in `createTicket` hieße, dass das Ausblenden eines Formulars die Überwachung
stumm schaltet oder einen Defender-Vorfall verwirft, und zwar ohne Meldung.

**Über einem API-Token steht keine Rolle.** `guardCMDBRequest` prüft die
Sichtbarkeit nur auf dem Sitzungsweg; ein Inventarskript wird nicht dadurch
weniger berechtigt, dass ein Admin den Agenten die Ansicht nimmt.

## Zwei Importregeln

**`lib/role-visibility.ts` darf kein `next/navigation` importieren.**
`lib/form-schemas.ts` liest die Regeln, `lib/tickets.ts` liest die Formulare, und
die DB-Suite lädt `lib/tickets.ts` unter `--conditions=react-server` — wo
`next/navigation` auf den Client-Build auflöst und beim Import wirft. Derselbe
Grund, aus dem `exportLookups` in `lib/cmdb.ts` und nicht in `lib/cmdb-api.ts`
steht. Der Seiten-Guard `requireArea` liegt deshalb in `lib/auth/session.ts`, wo
die anderen Guards stehen.

**Die Regeln selbst sind reine Funktionen in `types/mits.ts`**
(`roleSeesArea`, `roleSeesForm`, `areasForRole`), damit sie offline prüfbar sind.
`lib/role-visibility.ts` liest nur die Zeile und reicht sie herein.

## Client-Komponenten bekommen Booleans, keine Regeln

`UserMenu`, `PortalActions` und `StatsTiles` sind Client-Bauteile und lesen
nichts selbst — der Server löst auf und übergibt Props. Eine Client-Komponente,
die die Regel selbst auswertet, wäre eine zweite Stelle, an der sie gelten muss,
und die zweite ist die, die man vergisst.

`AppHeader` ruft dafür **einmal** `visibleAreas(role)` statt drei- bis fünfmal
`canSeeArea`: better-sqlite3 ist synchron, und jeder Read blockiert die
Event-Loop für alle anderen.
