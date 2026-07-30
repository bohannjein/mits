# Enterprise-Helpdesk — Umsetzungsplan

Arbeitsstand des Helpdesk-Ausbaus. **Part 1 bis 3 sind fertig und verifiziert.**
Nächster Schritt ist **Part 4 (Agenten-Dashboard & Präsenz)**.

Jeder Part ist so geschnitten, dass er allein baubar, testbar und committebar ist. Die
Reihenfolge folgt den Abhängigkeiten: E-Mail macht den Agenten-Workflow rund, Suche und
Dashboard bauen auf den bereits vorhandenen Query-Funktionen auf, der Formular-Builder
hängt an nichts und kommt deshalb zuletzt.

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

## ⬜ Part 4 — Agenten-Dashboard & Präsenz

Gates: `feature_agent_dashboard`, `feature_presence_sidebar`, `feature_stats_heatmap`
(alle Default an).

Schon vorhanden und typgeprüft, nur noch anzuzeigen:

- `listUnassignedTickets()`, `listAssignedTickets(agentId)`, `todayCounts()` in `lib/tickets.ts`
- `ticketCountsByLocation()` in `lib/locations.ts`
- Tabelle `mits_presence` (`user_id`, `seen_at`)
- `PresenceState`, `PRESENCE_LABELS`, `PRESENCE_IDLE_AFTER_SECONDS` (5 min),
  `PRESENCE_OFFLINE_AFTER_SECONDS` (30 min) in `types/mits.ts`

Zu bauen:

| Datei | Inhalt |
|---|---|
| `lib/presence.ts` | `touchPresence(userId)`, `listAgentPresence()` — Zustand aus `seen_at` abgeleitet |
| `app/agent/page.tsx` | Ticketeingang mit „Übernehmen“, eigene offene Tickets |
| `components/dashboard/agent-inbox.tsx` | Liste + Quick-Action |
| `components/dashboard/presence-list.tsx` | Technikerliste |
| `components/dashboard/stats-tiles.tsx` | Eröffnet/Geschlossen heute + Filial-Heatmap |
| `app/api/presence/route.ts` | Heartbeat, `POST`, session-geprüft |

**Präsenz-Farben — vom Nutzer ausdrücklich abweichend von der ersten Spezifikation:**

| Zustand | Farbe | Token |
|---|---|---|
| Aktiv | 🟢 grün | `--success` |
| Inaktiv / Idle | 🟡 **gelb** | `--warning` |
| Offline | ⚫ **grau** | `--muted-foreground` |

Ursprünglich war Idle grau und Offline ausgegraut. Der Nutzer hat auf gelb für Idle und
grau für Offline korrigiert. Nicht wieder umdrehen.

Punkte:

- Präsenz ist ein Indikator, kein Audit-Log: **eine Zeile pro Benutzer**, in place
  überschrieben.
- Heartbeat gehört an eine Stelle, die ohnehin läuft — nicht als eigener Poll-Timer, wenn
  es sich vermeiden lässt. `feature_typing_indicator` (Default **aus**) ist der Ort für
  dauerhafte Anfragen, Präsenz nicht.
- Nur Technik und Admin erscheinen in der Liste. Ein `user` hat dort nichts zu suchen —
  auch nicht als Datenpunkt.
- `todayCounts` vergleicht den ISO-Datumspräfix, also **UTC**. Für einen Zähler in Ordnung,
  aber nicht als „heute“ in einer Zeitzone verkaufen.

---

## ⬜ Part 5 — Formular-Builder (OTRS-Funktionsumfang, Apple-Optik)

Gate: `feature_advanced_form_builder` (Default an).

Der größte Part, hängt an nichts. Bestand: `/admin/forms/builder` mit
`components/admin/schema-builder.tsx` — funktioniert, ist aber ein Formular über dem
Schema, kein Canvas. Zielroute laut Anforderung: `/admin/schema-builder`.

Zu bauen:

- Drag-Canvas in der Mitte (`Reorder` aus `framer-motion`, wie in
  `components/admin/portal-layout-form.tsx` — **keine** neue Dependency), Inspector rechts
- Feldtypen: die bestehenden aus `MITSFieldWidget` plus `datetime`, `location` (aus
  `mits_location`), `user` (aus `listUsers`)
- Bedingte Sichtbarkeit: „Zeige X, wenn Y den Wert Z hat“ → in `uiHints`, Auswertung in
  `components/forms/schema-form.tsx`
- Abhängige Dropdowns: Eltern-Kind über eine Wertetabelle in `uiHints`

Punkte:

- **Ein neues Widget braucht `MITSFieldWidget` *und* `FIELD_REGISTRY`** — sonst rendert das
  Feld als Text-Input. Steht so in AGENTS.md.
- Bedingte Sichtbarkeit ist **keine** Sicherheitsgrenze. Ein verstecktes Feld kommt trotzdem
  im Payload an, wenn jemand es sendet. Die Validierung in `createTicket` ist `strictObject`
  — das bleibt die Grenze.
- `uiHints` ist `Record<string, MITSFieldUIHint>`, gekeyt nach Feldname, **ohne**
  `.fields`-Zwischenebene und **ohne** `label`. Labels kommen aus `resolveFields`.
- Der Builder muss weiter gültiges JSON Schema erzeugen — es geht als `format` an Ollama
  (siehe KI-Pipeline in AGENTS.md). Kein `enumNames`, Labels nach `uiHints.optionLabels`.

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
