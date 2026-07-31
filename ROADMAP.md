# Enterprise-Helpdesk — Umsetzungsplan

Arbeitsstand des Helpdesk-Ausbaus. **Alle acht Parts sind fertig.**

| Part | Inhalt | Status |
|---|---|---|
| 1 | Ticket-Nummern, Standorte, Agenten-Workflow, Toggles, JSON-Cleanup | ✅ `0f68a17` |
| 2 | E-Mail & SMTP | ✅ `217bee7` |
| 3 | Suche & Deep-Filter | ✅ `b17ee8f` |
| 4 | Agenten-Desk & Präsenz | ✅ `4fef5e6` |
| 5+6 | Routentrennung `/customer` + `/mits`, Prioritäts-Migration | ✅ `900ad2e` |
| 7 | Ticket-Verknüpfung + Textbausteine | ✅ `d50b252` |
| 8 | Formular-Builder (Canvas, Inspektor, bedingte Logik, Kaskaden) | ✅ |

Damit ist alles aus der ursprünglichen Anforderung umgesetzt außer Typing-Indicator,
SLA-Countdown und Duplikat-Vorschlägen — deren Flags sind in der Maske als „noch ohne
Funktion" markiert, damit niemand einschaltet und auf eine Wirkung wartet.

Jeder Part war so geschnitten, dass er allein baubar, testbar und committebar ist. Die
Reihenfolge folgte den Abhängigkeiten: E-Mail macht den Agenten-Workflow rund, Suche und
Dashboard bauen auf den vorhandenen Query-Funktionen auf, der Formular-Builder hing an
nichts und kam deshalb zuletzt.

---

## ✅ Part 1 — Fundament, Agenten-Workflow, Toggles

Commit `0f68a17`. Enthalten:

- `mits_ticket.ticket_number` (fortlaufend ab 1001, `TICK-1001`) + `location_id`,
  Nachrüst-Migration über `PRAGMA table_info`, Backfill ältestes-zuerst
- Tabellen `mits_location`, `mits_ticket_comment`, `mits_presence`
- `TicketStatus` um `waiting_user` und `resolved` erweitert; `resolved` gilt als **offen**
- `/tickets/[id]`: Angaben, Verlauf, Zuweisung, Status, Priorität
- Interne Notizen — Sichtbarkeitsfilter im SQL, nicht in der Komponente
- JSON-Dump nach dem Absenden ersetzt durch `TicketReceipt`
- `/admin/settings/features` mit allen 9 Flags, `/admin/locations`

---

## ✅ Part 2 — E-Mail & SMTP

Gate: `feature_email_notifications`. Dependency: `nodemailer` + `@types/nodemailer`.

Gebaut: `lib/smtp.ts`, `lib/mail-templates.ts`, `app/admin/settings/email/`,
`components/admin/email-settings-form.tsx`, `saveSmtpSettingsAction` +
`sendTestMailAction`. Auslöser in `app/api/tickets/route.ts` (Eingang) und
`app/tickets/[id]/actions.ts` (öffentliche Antwort).

Abweichungen von der ursprünglichen Planung, mit Grund:

- **Eingangsmail sitzt im Route Handler, nicht in `createTicket`.** `createTicket` ist
  synchron und hat mit SMTP nichts zu tun; „nach der Transaktion“ heißt hier ehrlicher
  „außerhalb der Funktion“.
- **`sendNotification` wird `await`ed.** Fire-and-forget würde in einer Serverless-Umgebung
  beim Antworten eingefroren und die Mail lautlos verlieren. Fehler frisst die Funktion
  selbst, Timeouts sind auf 10 s begrenzt.
- **Test-Mail geht nur an die eigene Adresse.** Ein Formular mit freiem Empfängerfeld wäre
  ein offenes Relay für jeden, der es erreicht.
- **`mail-templates.ts` hat kein `import "server-only"`** — reine String-Funktionen, damit
  das Escaping in `scripts/verify-forms.mts` prüfbar ist.
- **Antwort-Trigger prüft drei Bedingungen:** öffentlich, von einem Agenten, und Empfänger
  ≠ Autor. Sonst mailt MITS dem Melder seine eigenen Worte zurück.
- **Regel-2-Ausnahme:** Mail-HTML nutzt Literalfarben und Tabellen-Layout, weil Mail-Clients
  keine CSS-Variablen auflösen. In AGENTS.md vermerkt.

---

## ✅ Part 3 — Suche & Deep-Filter

Gate: `feature_ticket_search`. Keine neue Dependency.

Gebaut: `searchTickets` in `lib/tickets.ts`, `lib/ticket-query.ts` (gemeinsame
`searchParams`-Auswertung für beide Seiten), `components/tickets/ticket-search.tsx`,
`components/tickets/ticket-filters.tsx`, Suchfeld im Header, Filterleiste auf `/tickets`
und `/board`.

Abweichungen von der Planung, mit Grund:

- **Keine `app/api/tickets/search/route.ts`.** Die Suche ist ein `method="get"`-Formular auf
  die jeweilige Seite. Das Ergebnis ist damit eine echte URL — teilbar, bookmarkbar,
  Zurück-Taste funktioniert — und es läuft vor der Hydration. Eine API-Route hätte nur
  Client-State erzeugt, den niemand verlinken kann.
- **`lib/ticket-query.ts` ist neu** und in der Planung nicht vorgesehen. Zwei Kopien der
  `searchParams`-Auswertung wären auseinandergelaufen, und ein Filter, der auf zwei Seiten
  Verschiedenes bedeutet, ist schlimmer als kein Filter.
- **Ungültige Werte sind „kein Filter", nicht „leeres Ergebnis".** Ein Tippfehler in einer
  gemerkten URL soll nicht wie „es gibt keine Tickets" aussehen.
- **`to` vergleicht gegen `T23:59:59.999Z`**, nicht gegen das nackte Datum — sonst schließt
  `from=to=heute` alles von heute aus.
- **LIKE-Wildcards werden escaped.** Eine Suche nach `%` soll das Zeichen finden, nicht
  jedes Ticket.

---

## ✅ Part 4 — Agenten-Dashboard & Präsenz

Gates: `feature_agent_dashboard`, `feature_presence_sidebar`, `feature_stats_heatmap`.
Keine neue Dependency.

Gebaut: `lib/presence.ts`, `app/agent/page.tsx`, `app/api/presence/route.ts`,
`components/dashboard/{agent-inbox,presence-list,stats-tiles,presence-heartbeat}.tsx`.
`/agent` in `PROTECTED_PREFIXES` und im Proxy-Matcher.

**Präsenz-Farben — vom Nutzer ausdrücklich abweichend von der ersten Spezifikation:**

| Zustand | Farbe | Token |
|---|---|---|
| Aktiv | 🟢 grün | `--success` |
| Inaktiv / Idle | 🟡 **gelb** | `--warning` |
| Offline | ⚫ **grau** | `--muted-foreground/50` |

Ursprünglich war Idle grau und Offline ausgegraut. Nicht wieder umdrehen.

Abweichungen von der Planung, mit Grund:

- **Es gibt einen Intervall-Heartbeat**, gegen die eigene Notiz „kein Poll-Timer“. Er läuft
  nur bei sichtbarem Tab und mit halber Idle-Schwelle (2,5 min). Ohne ihn fällt eine
  Technikerin, die fünf Minuten an einer längeren Antwort schreibt, auf „inaktiv“, während
  sie arbeitet. Versteckter Tab hört auf zu schlagen — genau das soll „inaktiv“ heißen.
- **`presenceStateFor` liegt in `types/mits.ts`**, nicht in `lib/presence.ts`. Die zwei
  Schwellen sind das ganze Verhalten; ein Off-by-one etikettiert Kollegen falsch, ohne dass
  etwas falsch aussieht. Jetzt in `npm test` mit beiden Grenzwerten.
- **`AgentInbox` benutzt `assignTicketAction` wieder** statt einer eigenen Claim-Action.
  Diese prüft schon Session, Rolle und Ziel-Rolle und revalidiert die richtigen Pfade — ein
  zweiter Eingang in dieselbe Mutation wäre ein zweiter Ort, das falsch zu machen.
- **Abgeschaltetes Dashboard antwortet 404**, nicht mit einer Hinweisseite. Die Route
  existiert auf dieser Instanz nicht.
- **Heartbeat antwortet immer 204**, auch wenn er nichts schreibt (Modul aus, oder Aufrufer
  ist kein Techniker). Der Client soll aus dem Status nicht ableiten können, ob er Technik
  ist, und hat nichts, worauf er reagieren könnte.
- **Zeitzone wird benannt.** `todayCounts` vergleicht den ISO-Präfix, also UTC — steht als
  Hinweis unter den Kacheln, statt „heute“ zu behaupten.

Beim Testen bestätigt, kein Fehler: **eine per SQL geänderte Rolle greift erst nach dem
Ablauf des Session-Cookie-Caches (60 s) oder einer Neuanmeldung.** Wer im Test eine Rolle
umstellt, muss die Sitzung neu aufbauen.

---

## ✅ Part 8 — Formular-Builder

Gate: `feature_advanced_form_builder` (Default an) — schaltet das **Bearbeiten** von
Bedingungen und Kaskaden ab, nicht deren Auswertung.

Geblieben auf `/admin/forms/builder` statt der in der Anforderung genannten Route
`/admin/schema-builder`: die Seite existierte, war verlinkt und hätte für eine Umbenennung
ohne Funktionsgewinn dieselbe Link-Umzugsarbeit wie Part 5 verursacht.

Gebaut:

- **Canvas** (`Reorder` aus `framer-motion`, keine neue Dependency): Ziehen am Griff ordnet
  um, Klick wählt aus, Pfeiltasten-Buttons sind der Tastaturweg — `Reorder` ist pointer-only.
  Reihenfolge landet in `uiHints.order`, überlebt also die JSON-Fläche.
- **Inspektor** rechts über der Live-Vorschau: Beschriftung, Feldname, Platzhalter,
  Hilfetext, Gruppe, Pflicht, Optionen, Sichtbarkeit, Kaskade.
- **Drei neue Widgets**: `datetime` (`format: "date-time"` → `datetime-local`), `location`,
  `user`.
- **Bedingte Sichtbarkeit** und **abhängige Dropdowns**, beides in `uiHints`, ausgewertet in
  `lib/forms/schema-to-zod.ts` — also für Browser und Server in derselben Funktion.

Entscheidungen, die nicht offensichtlich sind:

- **`format: "date-time"` rendert jetzt `datetime`, nicht mehr `date`.** Vorher fiel die
  Uhrzeit still weg, obwohl das Schema sie verlangte. Verhaltensänderung für bestehende
  Schemata mit `date-time` — gewollt.
- **Umbenennen eines Feldes zieht alles mit**, was darauf zeigt: Property, Hint,
  `required`-Eintrag und jede `visibleWhen`/`optionsFrom`-Referenz. Ohne das Letzte würde
  eine Umbenennung stillschweigend eine Bedingung zerreißen.
- **Löschen räumt Verweise auf.** Und `saveFormSchemaAction` lehnt über
  `danglingConditions` ein Schema mit tot gelaufener Referenz ab — sonst ist ein
  Pflichtfeld dauerhaft unsichtbar und das Formular für alle unabsendbar.
- **Eine Kaskade spiegelt die Vereinigung ihrer Werte ins `enum`.** Ohne das beschreibt das
  an Ollama gegebene Schema ein Freitextfeld.
- **`useWatch({ disabled })`**: ein Schema ohne Bedingungen abonniert nichts und zahlt kein
  Re-Render pro Tastenanschlag.

Die vollständige Begründung steht in AGENTS.md unter „Bedingte Felder und abhängige
Auswahl“ — die eigentliche Falle ist, dass Client und Server dieselbe Ableitung brauchen.

---

## Fallen, die diese Session gekostet haben

Ausführlich in AGENTS.md; hier die Kurzliste, damit sie nicht zweimal auffallen:

- **Test-Artefakte niemals ins Projektverzeichnis.** Tailwind v4 scannt es, gespeicherte
  HTML-Dumps und Dev-Logs mit Klassennamen brechen den CSS-Build → jede Seite 500.
- **Server Actions sind per `curl` nicht ansteuerbar** — Next 16 legt keine
  `$ACTION_ID_`-Felder ins HTML. Store und Render-Pfad direkt prüfen.
- **Nicht nur gegen `localhost` testen.** Better Auth vertraut diesem Namen per Default;
  jeder andere Origin geht durch `trustedOrigins`.
- **Zod 4:** `z.record(Enum, …)` ist exhaustiv, `z.array(Enum)` lehnt unbekannte Elemente
  ab. Für normalisierende Schemata `z.partialRecord` bzw. `z.array(z.string())` + Filter.
- **SQL in Template-Literals:** kein Backtick im SQL-Kommentar.
- **Deutsche Anführungszeichen** mit `“` schließen, nicht mit `"` — sonst endet der String.
- **PowerShell:** `Resolve-Path` behandelt `[id]` als Wildcard, `-LiteralPath` nutzen.
  Commit-Messages mit `"` über `git commit -F <datei>`, nicht per Here-String.
- **Quick-Ticket-Schema:** `description` braucht min. 20 Zeichen — relevant für Testdaten.

## Verifikation für jeden Part

```bash
npm run typecheck && npm test && npm run build
```

Danach funktional gegen ein Wegwerf-Verzeichnis, Artefakte außerhalb des Projekts:

```bash
MITS_DATA_DIR=.tmp-x BETTER_AUTH_SECRET=$(openssl rand -hex 32) npx next dev -p 3105
```

Seed-Admin ist `admin@mits.local` / `Admin123!`; das `must_change_password`-Gate zuerst per
SQL räumen, sonst leitet jede Seite auf `/settings/profile` um. Zum Schluss `.tmp-x` und
`data/` entfernen.
