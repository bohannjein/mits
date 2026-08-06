---
paths:
  - "src/lib/role-visibility.ts"
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
