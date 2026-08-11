<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MITS — Modular IT Ticketing System

Open-Source, KI-first IT-Service-Portal. Kern ist ein **tri-modaler Ticket-Eingang**, der in
allen drei Fällen dieselbe strukturierte Payload erzeugt:

1. **Legacy** — klassisch, Titel + Freitext.
2. **Guided Wizard** — schema-driven, Kategorie zuerst, kein Freitext-Zwang.
3. **Smart KI-Chat** — Freitext/Bilder werden via Ollama in eine Formular-Payload übersetzt.

## Was wo steht

Diese Datei wird in **jede** Sitzung geladen. Hier stehen deshalb nur die Regeln,
die überall gelten: die sechs strikten Regeln, das Design-System, die
Routentrennung, das Auth-Modell und die Fallstricke, die schon zweimal
zugeschlagen haben.

Die Dokumentation der einzelnen Bereiche liegt in `.claude/rules/` und lädt sich
selbst, sobald jemand eine passende Datei anfasst — der CMDB-Abschnitt also beim
Arbeiten an `lib/cmdb.ts` und sonst nicht. Vorher stand alles hier: 122.000
Zeichen, rund 30.500 Token in jeder Sitzung, davon zwei Drittel über Bereiche,
die die jeweilige Sitzung nie berührt.

| Datei | Worum es geht |
|---|---|
| `.claude/rules/tickets.md` | Ticketseite, Chatverlauf, Antwortzeile, Textbausteine |
| `.claude/rules/reminders.md` | Snooze, Fälligkeit, Cron-Nudge, Widget |
| `.claude/rules/pins.md` | Tickets anheften, der Block über der Queue |
| `.claude/rules/categories.md` | Kategoriebaum, Queue-Filter, Smart-Routing, Intent-Kacheln |
| `.claude/rules/realtime.md` | SSE, Signale, Coalescing, Pop-out und Floating-Fenster |
| `.claude/rules/cmdb.md` | Objekte, Lizenzen, Firmen, Import, REST |
| `.claude/rules/analytics.md` | Kennzahlen, Zeiträume, Caching, Diagrammfarben |
| `.claude/rules/ai.md` | Opt-in-Architektur, Provider, Triage-Pipeline |
| `.claude/rules/forms.md` | Schema-Compiler, bedingte Felder, abhängige Auswahl |
| `.claude/rules/notifications.md` | Toast-Kanäle, Darstellung, Sammelmeldung |
| `.claude/rules/keyboard.md` | Kürzel, Formular-Isolation, Hilfe-Dialog |
| `.claude/rules/portal.md` | portal_config, Widgets, FAQ, Status, Wartung |
| `.claude/rules/visibility.md` | Was eine Rolle sieht: Formulare, Bereiche, Vorlagen |
| `.claude/rules/deployment.md` | Images bauen, Registry, Portainer |
| `.claude/rules/storage.md` | Dateiablage auf Platte oder S3, SigV4 |

**Struktur und Stack stehen nicht mehr hier.** Ein Verzeichnisbaum ist das, was
`ls` zeigt, und die Stack-Tabelle das, was in `package.json` steht — beides war
eine zweite Wahrheit, die veraltet, sobald jemand eine Datei verschiebt.

## Strikte Regeln

Diese Regeln haben Vorrang vor Bequemlichkeit. Kein Code, der sie bricht.

1. **Keine eigenen UI-Primitives.** Buttons, Modals, Inputs, Cards, Badges usw. kommen
   ausschließlich aus `src/components/ui/` (shadcn/ui, Style `radix-nova`). Neue Primitives
   per `npx shadcn@latest add <name>` holen, nicht handschreiben. Anpassen ist erlaubt —
   über `className` auf dem shadcn-Primitive, nicht durch einen Nachbau.
2. **Keine hartkodierten Farben.** Nur semantische Klassen: `bg-background`, `text-foreground`,
   `border-border`, `bg-primary`, `text-muted-foreground`, `bg-destructive`, … Kein Hex, kein
   `rgb()`, kein `oklch()` und keine Tailwind-Palette (`bg-zinc-800`) außerhalb von
   `src/app/globals.css`. Neue Farbe = neues Token in `globals.css` (`:root` **und** `.dark`).

   Das gilt auch für `dark:`-Paare wie `bg-blue-50 dark:bg-blue-950/40`. Ein Alpha-Wert
   mischt gegen das, was *dahinter* liegt — dieselbe Klasse landet auf `--card` bei
   einer anderen Farbe als auf `--background`. Deshalb sind die Chat-Bubbles
   `--bubble-*`-Tokens und nicht zwei Paletteklassen.

   **Die einzige Ausnahme ist `src/lib/mail-templates.ts`.** Mail-Clients entfernen
   `<style>`-Blöcke, lösen keine CSS-Custom-Properties auf, und Outlook rendert mit der
   Word-Engine. `bg-card` und `var(--card)` kämen dort als unformatierter Text an, deshalb
   Literalfarben inline und Tabellen-Layout statt Flexbox. Die Palette dort spiegelt das
   Light-Theme — ein Postfach ist nicht themebar. Bei Token-Änderungen von Hand nachziehen.
   Der Regel-2-Grep unten schließt die Datei deshalb aus.
3. **Keine Emojis im Frontend.** Nicht in Buttons, Badges, Karten, Tabellen oder Meldungen.
   Zustände und Bedeutung kommen über Lucide-SVG-Icons und Typografie. Typografische Zeichen
   sind erlaubt und keine Emojis: `→`, `—`, `·`, `„…“`. Diese Dateien (`AGENTS.md`,
   `ROADMAP.md`) sind Dokumentation, nicht UI — Emojis dort bleiben.
4. **Hilfetexte sagen, was zu tun ist — nicht, wie MITS funktioniert.** Ein Text unter
   einem Feld nennt, **was einzutragen ist** („Eine Domain pro Zeile, ohne `@`") oder
   **was mit den Daten passiert** („Für alle angemeldeten Personen lesbar"). Er erklärt
   nicht die Implementierung und begründet nicht die Architektur. Sätze wie „Zeitraum ist
   der laufende UTC-Tag" oder „Ungültiges JSON lässt die Vorschau auf dem letzten
   gültigen Stand" sind Notizen an den Entwickler und gehören in den Code-Kommentar, wo
   sie schon stehen. Sie machen die Maske länger und beantworten keine Frage, die jemand
   vor dem Bildschirm hat.
5. **Schema-First.** Es gibt keine Komponente pro Ticket-Typ (kein `Onboarding.tsx`). Ein
   Ticket-Typ ist ein `MITSFormSchema` (JSON Schema + `uiHints`); Formulare werden daraus
   dynamisch gerendert.
6. **`src/proxy.ts` ist keine Sicherheitsgrenze.** Die Next-Docs sind da eindeutig: eine
   Matcher-Änderung oder eine verschobene Server Function entfernt die Proxy-Abdeckung
   lautlos. Der Proxy ist nur der schnelle Weg (Redirect vor dem Rendern). **Jede**
   geschützte Seite ruft `requireUser`/`requireRole`, **jede** Route Handler und **jede**
   Server Action prüft die Session selbst — siehe `lib/auth/session.ts`.
7. **Niemals Eigentümerschaft aus dem Request lesen.** `created_by` kommt aus der Session.
   `MITSTicketDraftSchema` lässt das Feld bewusst weg, statt es optional zu machen.

## Regel 4, verschärft: keine Erklärsätze unter Feldern

Ein Feld mit der Beschriftung „Name“ braucht keinen Satz darunter, der erklärt,
dass dort der Name hingehört. Der ganze Bestand solcher Zeilen ist raus — und
was nicht offensichtlich war, ist an eine Stelle gewandert, an der es weniger
kostet:

- **Formatregeln in den `placeholder`.** „Eine Domain pro Zeile, ohne @“ wird
  `placeholder="firma.de"`. Im Feld gelesen, nicht darunter.
- **Einheiten ins Label.** „Anzeigedauer“ plus die Zeile „Sekunden.“ wird
  „Anzeigedauer (Sekunden)“.
- **Vertikale Abstände nachgezogen.** Das `gap-5` zwischen zwei Feldern gab es,
  damit ein zweizeiliger Hilfetext nicht in die nächste Beschriftung läuft. Ohne
  ihn ist es Luft um nichts.

**Was bleibt, und warum.** Der Maßstab ist nicht „kurz“, sondern: kann jemand die
Folge aus dem Feld selbst ableiten, und was kostet es, wenn nicht.

| Bleibt | Weil |
|---|---|
| „Für alle angemeldeten Personen lesbar.“ | wer eine Datei lesen kann, steht nirgends sonst |
| „…verlieren aber die Zuordnung.“ | was das Entfernen eines Standorts mit Tickets tut |
| „…behalten den alten Namen.“ | ein umbenanntes Feld ist eine Datenentscheidung |
| „Erst Host und Absenderadresse speichern.“ | der einzige Hinweis, warum der Knopf tot ist |
| „max. N MB je Datei“ | eine Grenze, kein Hinweis |
| Token wird einmal angezeigt | nicht wiederholbar |

Ein entfernter Erklärsatz ist eine gewonnene Zeile. Eine entfernte Warnung ist
ein Supportfall.

## Design-System

**Google Web Design Language** (Material 3 / Gemini), **beide Themes
gleichwertig** (`ThemeProvider`: `defaultTheme="system"`, `enableSystem`).

**Voreingestellt ist das Betriebssystem.** Wer den Schalter nie angefasst hat,
bekommt, was sein Gerät sagt — ein Laptop im Hellmodus öffnet MITS hell. Vorher
stand hier `dark`; das ist der Look des Produkts, war aber eine Entscheidung, die
der Browser bereits getroffen hatte und die MITS überschrieb. `enableSystem` ist,
was den Wert wirksam macht: es hängt den `prefers-color-scheme`-Listener ein, die
Seite folgt also auch einem Rechner, der abends umschaltet. Eine ausdrückliche
Wahl (Hell / Dunkel) schreibt nach `localStorage` und pinnt — das System wird dann
nicht mehr gefragt, bis jemand wieder *System* wählt.

**`<html>` trägt kein hartes `dark` mehr.** Eine statische Klasse im Markup ist
eine Vermutung, und sie war für jeden Rechner im Hellmodus falsch — dunkler Blitz
bei jedem Kaltstart. `next-themes` löst die Klasse aus einem blockierenden Skript
vor dem ersten Paint auf, dafür ist `suppressHydrationWarning` da. `color-scheme:
light dark` steht daneben, damit Scrollbalken und Formularelemente des Browsers
passen, bevor irgendein CSS von uns greift.

Umgeschaltet wird **nur** unter „Erscheinungsbild“ in `/settings/profile`;
gespeichert wird in `localStorage`, nicht in `mits_setting` — das ist eine
Eigenschaft dieses Browsers, nicht der Person.

**Im Header steht der Schalter nicht mehr**, auch nicht abgemeldet. Er wird
einmal betätigt und stand danach auf jeder Seite herum; ohne Anmeldung gibt es
ohnehin kein Profil, das die Wahl trägt, und `defaultTheme="system"` liefert
dort bereits das, was das Gerät sagt.

**Und die Live-Verbindung ebenso wenig.** Der Punkt mit dem WLAN-Symbol meldete
auf jeder Seite und für jede Rolle einen funktionierenden Stream — eine Auskunft,
die nur interessiert, wenn etwas klemmt, vor Leuten, die daran nichts ändern
können. `ConnectionDot` lebt weiter, jetzt in einer Zeile auf `/admin/status`
neben den übrigen Teilsystemen.

**Die Hover-Regel.** Jede interaktive Fläche ändert beim Hover ihren *Hintergrund*
und lässt den Vordergrund auf vollem Kontrast. Kein `hover:text-muted-foreground`
auf etwas, das gleichzeitig heller wird — genau so verschwindet eine Beschriftung
unter dem Cursor, und im Review fällt es nicht auf, weil der Ruhezustand stimmt.
Braucht ein Zustand eine eigene Hover-Farbe, ist das ein Token (`--primary-hover`)
und kein Alpha-Schritt: `bg-primary/80` mischt gegen das, was dahinter liegt, und
ist deshalb in einem Theme lesbar und im anderen ausgewaschen.

| Token | Wofür |
|---|---|
| `--primary-hover` | gefüllte Primärflächen, in **beiden** Themes dunkler |
| `--bubble-own*` | eigene Nachricht, neutrales Grau |
| `--bubble-other*` | Nachricht der Gegenseite, Blau, plus `-accent` für das Rollen-Label |
| `--bubble-internal*` | interne Notiz, Amber, gestrichelter Rand |

Bubble-Flächen sind **deckend**, nicht als Alpha-Tint definiert. Ein
`bg-blue-950/40` compositet gegen den Untergrund, und dieselbe Agenten-Antwort säße
in der Ticket-Spalte auf `--card` und in einem Dialog auf `--background` — zwei
Farben für einen Sprecher.

| Merkmal | Umsetzung |
|---|---|
| Surface-Rampe | `bg-background` #131314 · `bg-card` #1e1e1f · `bg-surface-elevated` #28282a |
| Border | Haarlinie `oklch(1 0 0 / 10%)` = white/10, nicht opak |
| Radius | `--radius: 0.75rem`, Material-Shape-Scale 8/10/12/16/24/28/32px |
| Elevation | `shadow-elev-1..3` (mehrstufig weich) + `shadow-glow`, `shadow-glow-gemini` |
| Akzent | `--primary` = Google Blue (#0b57d0 hell / #a8c7fa dunkel) |
| Pill-Buttons | `rounded-full` + `bg-inverse-surface text-inverse-surface-foreground` |
| Gemini-Gradient | `--gemini-1/2/3` (#4285f4 → #9b72cb → #d96570) |
| Utilities | `bg-aurora` (weiches Radial-Wash), `bg-gemini-sheen`, `text-gemini`, `label-industrial` |

Alles leitet sich aus Tokens in `globals.css` ab und folgt dem Theme automatisch.

**`bg-white`/`text-black` ist kein Ersatz für `bg-inverse-surface`.** Der Gemini-Pill-Button
ist im Light-Theme invertiert (dunkel auf hell). Eine literale Farbe wäre dort unlesbar — und
würde Regel 2 brechen.

Das Neobrutalism-Vokabular ist vollständig entfernt: `shadow-brutal*`, `border-2`, `rounded-sm`,
`rounded-none` und `uppercase`-Headings kommen in `src/` nicht mehr vor (außer in
`components/ui/`, wo `rounded-none` legitime Variantenlogik der Primitives ist). Die
Zuordnung, falls doch etwas auftaucht:

| Element | Klassen |
|---|---|
| Karte, oberste Ebene | `rounded-3xl border border-border bg-card ring-0 shadow-elev-1` |
| Karte mit Fokus (Auth, Dialog) | dieselbe, aber `shadow-elev-2` |
| Verschachtelte Box, Alert, Tabelle | `rounded-2xl border border-border` |
| Input, Textarea, Select, Code-Block | `h-10 rounded-xl` bzw. `rounded-xl` |
| Button primär | `rounded-full bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover` |
| Button sekundär | `rounded-full bg-surface-elevated text-foreground hover:bg-accent` |
| Badge, Chip, Tab | `rounded-full` |
| CardFooter | `rounded-b-3xl border-t border-border bg-transparent` |
| Hover auf klickbarer Karte | `hover:border-foreground/20 hover:shadow-elev-3` |
| Icon in Karte | `size-11 rounded-full bg-surface-elevated text-muted-foreground` + `strokeWidth={1.5}` |

`font-mono` bleibt nur, wo Zeichenraster Bedeutung trägt: JSON-Payloads, OCR-Rohtext,
Schema-IDs, Modell-Tags. Zählwerte und Labels sind Sans.

Bewegung läuft über `framer-motion` mit **Spring-Physics**, nie mit `duration`-Easing.
Referenz-Werte in `components/dashboard/portal-actions.tsx` (`ENTRANCE`, `LIFT`) und
`tri-modal-container.tsx` (`PILL`, `PANEL`). `useReducedMotion()` wird explizit abgefragt —
framer-motion tut das nicht von selbst. Rein dekorative Endlos-Animationen laufen als
CSS-Keyframes (`gemini-drift`), damit sie der Compositor übernimmt.

## Roadmap

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Setup, Design-System, Typ-Fundament | ✅ |
| 2 | Form Engine (`schema-to-zod`, `SchemaForm`, Registry) + Tri-Modal-Eingang | ✅ |
| — | Auth & RBAC (Better Auth, Rollen, Registrierungspolicy, Ticket-Persistenz) | ✅ |
| 3 | KI-Routing, Vision-OCR, Dockerization für Portainer | ✅ |
| 4 | Portal (Banner + Schnellzugriffe), Datei-Ablage, Formular-Builder | ✅ |
| 5 | Modulares Portal-Dashboard (`portal_config`, FAQ, Status, Wartung) | ✅ |
| 6 | Enterprise-Helpdesk — siehe **[ROADMAP.md](ROADMAP.md)** | Part 1 ✅, Part 2–5 offen |

## ➡️ Aktueller Arbeitsstand

**Der Helpdesk-Ausbau ist abgeschlossen — Part 1 bis 8 sind fertig.** Der vollständige Plan
mit Dateien, Entscheidungen und Stolperfallen steht in **[ROADMAP.md](ROADMAP.md)**; vor
Änderungen an diesen Bereichen dort lesen, nicht neu herleiten.

| Part | Inhalt | Status |
|---|---|---|
| 1 | Ticket-Nummern, Standorte, Agenten-Workflow, Feature-Toggles, JSON-Cleanup | ✅ `0f68a17` |
| 2 | E-Mail & SMTP (`nodemailer`, `/admin/settings/email`) | ✅ |
| 3 | Suche & Deep-Filter (`searchTickets`, `lib/ticket-query.ts`) | ✅ |
| 4 | Agenten-Desk & Präsenz (`lib/presence.ts`) | ✅ |
| 5 | Routentrennung `/customer` + `/mits`, Queue mit Tabs | ✅ |
| 6 | Prioritäten `low/medium/high/critical` migriert | ✅ |
| 7 | Ticket-Verknüpfung + Textbausteine | ✅ |
| 8 | Formular-Builder (Canvas, bedingte Logik, abhängige Dropdowns) | ✅ |
| — | Nummernkreise `TCK-1…` und `INV-1…`, Löschknopf mit Passwortabfrage | ✅ |
| — | CMDB: Firmen, Objekte, Beziehungen, Lizenzen, Import, REST (12. Flag) | ✅ |
| — | Dual-Theme, Rollen-Rename, Bubbles, Toasts, Queue, Zeit, Makros, S3, Mail-Abruf | ✅ |
| — | Erinnerungen, Kategoriebaum + kaskadierender Filter, Smart-Routing (3 Flags) | ✅ |
| — | Tickets anheften: eigener Block über der Queue, pro Person (16. Flag) | ✅ |

## Drei Kern-Features nach der CMDB

Erinnerungen, Kategorien und Smart-Routing. Die Begründungen stehen in
`.claude/rules/reminders.md` und `.claude/rules/categories.md`; was hier stehen
muss, weil es überall gilt:

**Kategorie und Formular-Kategorie sind zwei verschiedene Dinge.**
`MITSFormSchema.category` ist eine Freitext-Überschrift auf einem Formular und
bleibt das. `mits_ticket.category_id` zeigt auf `mits_ticket_category` — die
Ablage-Dimension, auf die die Queue filtert und die die Regeln schreiben.

**Die Wurzel einer Kategorie hat `parent_id = ''`, nicht `NULL`.** SQL zählt
NULLs in einem Unique-Index als verschieden, „Hardware" ließe sich also zweimal
als Wurzel anlegen — und der Filter zeigte dann zwei gleiche Einträge mit je der
Hälfte der Tickets.

**Der Melder gewinnt gegen die Regel.** Die Intent-Kacheln sind der Melder, der
seine Anfrage einordnet; eine Regel füllt nur die Lücke (Freitext, Mail, REST).
Priorität darf eine Regel nur **erhöhen**.

**`services/ai/routing.ts` schreibt weiterhin keine Kategorie.** Der
Modellvorschlag bleibt ein Tag. Was schreiben darf, ist das deterministische
Regelwerk unter `/admin/settings/routing` — nachlesbar, und die Historie sagt
mit `category_changed`, was es getan hat.

**Erinnerungen sind pro Person und werden abgeleitet, nicht zugestellt.** Es gibt
keine Benachrichtigungstabelle; `dueReminders` liest das Fenster
`since < due_at <= now`. `/api/cron/reminders` liefert nichts, es stößt nur an.

## Nach der CMDB: Betriebsausbau

Ein Durchgang, neun Themen. Was dabei nicht offensichtlich ist:

**Die Rolle heißt `agent`, nicht mehr `technician`.** Migriert in
`renameTechnicianRole` (`lib/db/sqlite.ts`), und trotzdem steht das alte Wort noch
an zwei Stellen: `LEGACY_ROLES` in `lib/auth/roles.ts` und `LEGACY_ROLE_MAP` in
`types/mits.ts`. Beide sind nicht redundant. Better Auth cacht die Rolle 60 s im
signierten Cookie, und ein aus einem älteren Backup zurückgespieltes
`mits.db` hat die Migration nie gesehen — ohne die Zuordnung fiele `toRole` auf
`user` zurück und **jeder Agent verlöre still die Queue**. Das Fehlerbild ist eine
leere Queue, nicht etwas, das nach einem Rollennamen aussieht.

**Sortierung liegt in der URL, nie im Component-State.** `lib/ticket-sort.ts`
liefert die `ORDER BY`-Ausdrücke aus einer Whitelist — `ORDER BY` lässt sich in
SQLite nicht parametrisieren, ein ungeprüfter Schlüssel wäre konkatenierte SQL.
Nebeneffekt und Grund: `TicketTable` bleibt eine Server Component, also wird das
relative Alter einmal beim Rendern berechnet statt nach der Hydration.

**Ungelesen wird abgeleitet, gelesen wird gespeichert.** `mits_ticket_read` hält je
Paar einen Zeitstempel; „ungelesen“ ist der Vergleich mit der jüngsten Aktivität,
die dieser Leser **nicht** verursacht hat. Ein gespeichertes Boolean müsste jeder
Schreiber für jeden anderen Benutzer zurücksetzen, und der erste, der es vergisst,
hinterlässt ein Ticket, das sich nie wieder meldet.

**Priorität ist eine Agenten-Entscheidung.** `createTicket` klemmt den Entwurf einer
melderseitigen Anfrage auf `medium` — das ist die Grenze, nicht das fehlende Feld im
Formular. `QUICK_TICKET_SCHEMA` ist deshalb auf Version 2 und ohne
`priority`-Feld; dessen `optionLabels` zeigten seit der Prioritäts-Umbenennung
ohnehin die Rohwerte an.

## Zwei Nummernkreise, eine Form

`TCK-1000000000000001` ist das erste Ticket einer Instanz, `INV-10000001` das erste
Inventarobjekt. Sechzehn Ziffern beim Ticket, acht beim Objekt, die führende `1`
jeweils mitgezählt.

**Die führende 1 gehört zur Anzeige, nicht zum gespeicherten Wert.** In der
Datenbank steht der Zähler — 1, 2, 3 —, das Format baut der Rest. Das ist keine
Kosmetik: `10000000000000001` liegt jenseits von `Number.MAX_SAFE_INTEGER`
(~9,007e15) und ließe sich in einer JavaScript-Zahl nicht ohne Rundung halten.
Sortieren, Zählen und Vergleichen laufen deshalb auf dem Zähler, und nur
`formatTicketNumber`/`formatInventoryNumber` und ihre `parse`-Gegenstücke kennen
die Polsterung. Kapazität ist damit 10^15−1 Tickets und 9.999.999 Objekte.

**Ein Ziffernblock in voller Breite mit führender 1 ist die Anzeigeform** und
verliert diese Ziffer beim Parsen; alles Kürzere ist der Zähler selbst. Genau
deshalb ist die erste Ziffer fest und nicht frei — sonst wären `TCK-1042`
(Ticket 1042, handgetippt) und `TCK-1000000000001042` nicht unterscheidbar.

- **Der Mailbetreff trägt die Anzeigeform**: `[TCK-1000000000001042] Neue
  Antwort: …`. `ticketNumberFromSubject` gibt den Klammerinhalt an
  `parseTicketNumber` weiter, statt die Regel zu wiederholen — zwei Kopien wären
  zwei Orte, an denen ausgehender Betreff und eingehender Treffer um einen Faktor
  auseinanderlaufen.
- **`TICK-` wird weiter erkannt**, obwohl nichts es mehr erzeugt: es steht in
  gesendeter Mail und auf Notizzetteln.
- **Bestehende Zeilen werden nicht umnummeriert.** Sie behalten ihren Zähler und
  erscheinen im neuen Format; ein Renumbering würde jede bereits versendete
  Referenz ungültig machen.
- **Die Inventarnummer vergibt MITS beim Anlegen** und ändert sie nie mehr —
  `CIInput` lässt das Feld weg, ein Import kann es nicht setzen. Der freie
  `asset_tag` daneben ist **Fremdnummer**: ein Aufkleber, eine Nummer aus einem
  Altsystem.

## Zwei Welten

```
/                       öffentlicher Einstieg: Login-Maske, angemeldet -> /customer
/customer/…             Anwender: Portal, Ticket-Erstellung, eigene Tickets, schlanke Detailansicht
/mits/                  Agenten: Live-Queue mit Tabs, Präsenz + Statistik als Spalte
/mits/tickets/[id]      Agenten-Detailansicht mit Workflow-Panel
/mits/tickets/[id]/popout  nur der Verlauf: eigenes Fenster und iframe-Inhalt
/mits/cmdb/…            Bestand, Lizenzen, Objekt-Detailansicht (Agenten)
/mits/analytics         Statistiken (Agenten), Anwender gesperrt
/admin/…                Administration
/admin/macros           Makros
/admin/categories       Kategoriebaum: Haupt- und Unterkategorien, Kachel-Symbol
/admin/settings/routing Stichwort-Regeln: Kategorie, Mindestpriorität, FAQ-Vorschläge
/admin/settings/roles   Sichtbarkeit je Rolle: welche Formulare, welche Bereiche
/admin/settings/storage Dateispeicher (Platte oder S3)
/admin/settings/api-keys API-Keys je System, Token nur einmal sichtbar
/admin/status           Systemzustand: was eingerichtet ist, plus Live-Verbindung
/admin/settings/tickets  Wo die Antworten eines Formulars stehen (Verlauf, daneben, beides)
/admin/settings/analytics Widget-Schalter und Default-Intervall
/admin/settings/notifications Kanäle, Darstellung, Sammelmeldung
/admin/mail             Postfach-Abruf + Defender-Regel
/api/notifications      Feed für die Einblendungen, `?since=` (jede Rolle)
/api/realtime/stream        SSE-Signale: ticket | notify | queue
/api/tickets/check-updates  Queue-ETag, antwortet 304 wenn nichts anders ist
/api/tickets/[id]/activity  Fingerabdruck, Ersatzweg wenn der Stream fehlt
/api/notifications/digest   Sammelmeldung ab der eingestellten Schwelle
/api/cron/reminders     Fällige Erinnerungen anstoßen, Service-Token **oder** Admin-Sitzung
/api/analytics          Kennzahlen als JSON oder `?format=csv` (Agenten)
/api/mail/poll          Postfach abrufen, Service-Token **oder** Admin-Sitzung
/api/v1/cmdb/…          REST-Schnittstelle, Token **oder** Agenten-Sitzung
/api/v1/cmdb/items?format=csv  Bestand als CSV — genau das Format, das der Import liest
/api/v1/tickets         Ticket von einer Maschine, nur `Authorization: Bearer`
```

**Eintrittsweg und In-App-Navigation sind zwei verschiedene Ziele.** Wer den bloßen
Host aufruft, will das Portal — `/`, `/login` und `/register` schicken **jeden** nach
`/customer`, auch die Technik. Innerhalb der App entscheidet weiter `homeFor(role)`:
Logo und Benutzermenü bringen einen Agenten zurück in die Queue, nicht ins Portal,
sonst wäre der Arbeitsweg zwei Klicks statt einem. Ein `?next=` aus einer geschützten
Seite schlägt beides — ein Deep-Link auf ein Ticket landet nach der Anmeldung auf
diesem Ticket.

`/tickets`, `/board` und `/agent` existieren **nicht mehr** und werden nicht umgeleitet.

**Ein `user` auf `/mits/*` landet auf `/customer`, nicht auf `/forbidden`.** Das steuert
`deniedPathFor` in `lib/auth/roles.ts`; alles ohne kleinere Sicht behält `/forbidden`.

**Ein Anwender bekommt keinen Weg aus `/customer` heraus.** Nicht nur keinen erlaubten — gar
keinen: es wird ihm kein Link nach `/mits` oder `/admin` angezeigt. Der Guard fängt den
Direktaufruf ab, aber ein sichtbarer Link, der in einen Redirect läuft, ist eine schlechtere
Antwort als kein Link. `components/auth/user-menu.tsx` ist die **einzige** Stelle mit
Bereichswechsel-Links, und jeder Eintrag dort hängt an `canViewBoard`/`canAdminister` — den
Prädikaten, die auch der Server-Guard benutzt. Neue Navigation in einer Anwenderseite darf
kein `/mits`- oder `/admin`-Ziel ohne dieses Gate enthalten. Auch das Logo zeigt auf
`homeFor(role)` statt auf `/`, damit ein Anwender nicht durch den Dispatcher läuft. Prüfbar
am gerenderten HTML, nicht am Quelltext:

```bash
curl -s -b <anwender-cookie> http://127.0.0.1:3112/customer | grep -E 'href="/(mits|admin)'
```

Ausnahme sind admin-gepflegte Schnellzugriffe: `isSafeResourceHref` lässt Pfade ab `/` zu,
ein Admin kann dort also bewusst auf einen Technikbereich zeigen. Das ist redaktioneller
Inhalt, kein Navigationsdefekt.

## Massenersetzung hat dieses Projekt jetzt dreimal beschaedigt

Erst `sed` beim Umbenennen von `technician` auf `agent`, das die gerade
geschriebene `LEGACY_ROLES`-Zuordnung zu `agent: "agent"` machte. Dann ein
`.replace()` ohne Zaehler, das die Kommentarzeile und ihr `INSERT` auseinander
laufen liess. Und zuletzt das hier:

```ts
// Der Helfer, gerade eingefuegt:
function revalidateTicket(ticketId: string): void {
  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  …
}

// …und im selben Lauf die Ersetzung, die dreizehn Aufrufstellen zusammenfassen
// sollte — und dabei den Rumpf des Helfers mit erwischte:
function revalidateTicket(ticketId: string): void {
  revalidateTicket(ticketId);   // <-- Endlosrekursion
  …
}
```

Ergebnis: `RangeError: Maximum call stack size exceeded` bei **jeder**
Ticket-Mutation — Antworten, Status, Prioritaet, Zuweisung, Verknuepfungen,
Zeiten. Das ist der Serverfehler, der als „fast im ganzen System die ganze Zeit"
gemeldet wurde.

**Die Regel, die daraus folgt und schon zweimal haette gelten muessen:** eine
Ersetzung, die auf mehr als eine Stelle passt, darf nicht ueber Code laufen, der
im selben Durchgang eingefuegt wurde. Entweder mit Zaehler ersetzen, oder erst
einfuegen und in einem zweiten, getrennten Lauf zusammenfassen. Alle drei Faelle
haben `typecheck`, `test` und `build` passiert: das Ergebnis war jedes Mal
syntaktisch gueltiger Code mit vertauschter Bedeutung.

## Wenn etwas wirft: Grenzen, Kennung, Protokoll

**`error.tsx` und nicht `react-error-boundary`.** Der gejagte Absturz passiert
beim *serverseitigen* Rendern, und eine Client-Boundary kann nur fangen, was im
Browser wirft. App-Router-Boundaries fangen beides: Next reicht einen
Server-Render-Fehler an die nächste `error.tsx` weiter, mit einem Digest.

Drei Ebenen, weil sie verschiedene Dinge abdecken:

| Datei | Fängt |
|---|---|
| `app/global-error.tsx` | das Root-Layout selbst |
| `app/error.tsx` | jede Seite darunter |
| `…/tickets/[id]/error.tsx` | die beiden Ticketseiten einzeln |

Die globale ist die wichtige und wird am ehesten übersehen: `error.tsx` liegt
**innerhalb** des Layouts und kann sein eigenes Elternteil nicht fangen. Wirft das
Layout, gibt es auf jeder Route gleichzeitig das nackte „A server error occurred"
— ohne Wiederholen und ohne Hinweis, was gescheitert ist.

**Das Layout kann nicht mehr werfen.** Seine drei Lesevorgänge (Zeitzone,
Sitzung, Benachrichtigungseinstellungen) degradieren, statt die Anwendung
mitzunehmen. Keiner davon ist tragend: ohne Sitzung bleibt der Stream aus und der
Guard der Seite leitet weiterhin korrekt um, ohne Einstellungen nehmen die Toasts
ihre Defaults.

**`unstable_rethrow` steht als erste Zeile in jedem dieser `catch`.** Next
signalisiert Kontrollfluss durch Werfen — `DynamicServerError`, wenn ein
statischer Render `headers()` anfasst, dazu die Marker hinter `redirect()` und
`notFound()`. Eines davon zu verschlucken macht eine Seite nicht robust, es macht
das Framework kaputt: die erste Fassung dieses Wrappers fing den
Dynamic-Bail-out ab und ließ `next build` mit Exit 255 scheitern. Ein breites
`catch` um Framework-Aufrufe braucht diese Zeile, immer.

**Die Fehlerkarte zeigt den Digest.** Next ersetzt eine serverseitige
Fehlermeldung absichtlich durch einen Hash, damit kein Stack den Server verlässt
— die Folge ist, dass „A server error occurred" alles ist, was jemand melden
kann, während dieselbe Zahl im Container-Log neben dem echten Stack steht:

```bash
docker logs mits-web 2>&1 | grep <digest>
```

### Was nach dem Schreiben passiert, darf das Schreiben nicht scheitern lassen

Der Fehlerklasse nach war das der wahrscheinlichste Absturz beim Absenden: der
Beitrag steht in der Datenbank, und *danach* wirft etwas — eine Revalidierung,
ein SMTP-Host, der langsam auflöst, eine Vorlage, die auf ein entferntes Feld
greift. Der Agent sieht „A server error occurred", sendet erneut, und das Ticket
hat die Nachricht zweimal.

Jetzt entscheidet der Schreibvorgang das Ergebnis, alles danach ist Beiwerk und
wird protokolliert. Beim „Antworten & Schließen" ist das Schließen die Ausnahme:
es gehört zum Versprechen des Knopfes, wird also gemeldet („Antwort ist raus, der
Status nicht") statt verschluckt.

Ein abgelehnter Beitrag ist zusätzlich ein Toast. Der Alert darunter steht am
unteren Ende einer scrollenden Spalte und ist auf einem langen Verlauf regelmäßig
außerhalb des Bildes — was der Agent dann sieht, ist ein Knopf, der wieder normal
aussieht, und ein Text, der noch dasteht. **Der Text bleibt bei jedem Fehler
stehen**; was auch schiefging, das eine, was es überleben muss, ist das gerade
Geschriebene.

### Der Stream

- **`cancel()` fehlte.** `abort` deckt Navigation und geschlossenen Tab ab, aber
  wenn die Runtime den Stream abräumt, ruft sie `cancel`. Jeder solche Abbau ließ
  eine Registrierung zurück, deren `deliver` bei jedem späteren `publish` in
  einen toten Controller schreibt — ein Leck, das mit der Laufzeit des Prozesses
  wächst.
- **Die Frames werden defensiv gebaut.** Ein fehlerhafter ist schlimmer als ein
  fehlender: `EventSource` kann sich mitten im Strom nicht resynchronisieren, eine
  kaputte Zeile bricht also alles Folgende auf dieser Verbindung — und der Client
  zeigt weiter „live" über einer Seite, die stehengeblieben ist. `type` wird gegen
  die drei bekannten Werte geprüft statt interpoliert, `ticketId` auf String oder
  `null` normalisiert; `undefined` würde den Schlüssel wegserialisieren.

### Kein doppeltes Rendern nach dem Senden

Absicht und schon so gebaut: `publish` schließt den Verursacher aus (`actorId`),
der Absender bekommt also **kein** SSE-Signal für seine eigene Nachricht. Was sie
ihm zeigt, ist die `revalidateTicket` der Server Action — ein Weg, nicht zwei.
Alle anderen bekommen das Signal und rendern zusammengefasst.

## Was an dieser Runde sonst noch kaputt war

**Das Sende-Kürzel leerte das Feld, statt zu senden.** Das Composer-`<form>` hat
keine eigene `action` — die beiden Knöpfe tragen `formAction`, weil Antworten und
Antworten-und-Schließen zwei Server Actions sind. Ein nacktes `requestSubmit()`
sendet damit **ohne** Action: React hat nichts auszuführen, der Browser macht
seinen Default-Submit, das Feld wird zurückgesetzt. Jetzt wird der Antwort-Knopf
als Submitter benannt.

**Ein gebundenes Objekt darf keine Schlüssel haben, die das Statement nicht
nennt.** better-sqlite3 lehnt das ab — „Too many parameter values were provided" —
statt sie zu ignorieren. `edited_at: null` an die Kommentarzeile zu schreiben,
ohne die Spalte in das `INSERT` aufzunehmen, hat damit **jedes Absenden** zu einem
500 gemacht. Der Typechecker sieht das nicht: beide Hälften sind für sich gültig,
und der Vertrag zwischen ihnen ist ein String. Wer hier ein Feld ergänzt, ergänzt
zwei Stellen.

**Der Status änderte sich nicht überall.** Dreizehn Aufrufstellen revalidierten
von Hand, alle die beiden Detailansichten und die Queue — **keine**
`/customer/tickets`. Ein Agent schloss ein Ticket, und die Liste des Melders
nannte es weiter offen. Jetzt ein `revalidateTicket`, das jede Fläche kennt,
inklusive `/customer` wegen des Portal-Panels.

**Eine Kundenantwort auf ein geschlossenes Ticket öffnet es wieder.** In
`addComment`, damit der Mail-Ingest es mitbekommt — der häufigste Fall ist eine
Antwort auf die Schließungsmail, die nie eine Server Action berührt. Nur für
Melder und nur öffentlich: ein Agent, der auf einem geschlossenen Ticket eine
Notiz ablegt, archiviert, er reaktiviert nicht. Zurück auf `open`, nicht auf den
alten Status — was das Ticket vor drei Wochen tat, tut es jetzt nicht mehr.

**Geschlossene Tickets sind beim Melder unter „Verlauf".** Die Liste eines
Melders ist eine Liste dessen, was noch läuft; zehn erledigte Tickets über dem
einen, auf das er wartet, ist dasselbe Versagen wie ein ungefilterter Posteingang.
Nicht versteckt, einen Klick entfernt. **Die Agentenseite bleibt unverändert** —
eine Queue, die geschlossene Tickets stillschweigend weglässt, ist eine Queue, die
niemand prüfen kann.

**„Antworten und Ticket schließen" steht nicht mehr neben „Antworten".** Zwei
gleich große gefüllte Pillen nebeneinander laden im Tempo zur falschen ein, und
die falsche ist hier die, die das Gespräch beendet.

**Ein Sprung-Knopf statt umgedrehter Reihenfolge.** Beide Ansichten lesen wieder
älteste zuerst — ein Chat, der an einer Stelle nach unten und an der anderen nach
oben liest, sind zwei Produkte, und die Antwortzeile ist in beiden unten. Wer
weggescrollt ist, bekommt stattdessen einen Knopf mit der Zahl der verpassten
Nachrichten; wer unten steht, scrollt automatisch mit.

## Auth-Modell

- **Rollen:** `user` < `agent` < `admin`. Vergleiche immer über `hasAtLeast`,
  nie über `===`. Unbekannte Rollenwerte fallen auf `user` zurück, nie nach oben.
- **Sichtbarkeit verengt die Rolle, sie ersetzt sie nicht.** `/admin/settings/roles`
  nimmt `user` und `agent` einzelne Formulare und Bereiche weg; Default ist alles
  sichtbar, `admin` ist nicht einschränkbar (die Maske liegt selbst unter
  `/admin`). Gespeichert wird das **Weggenommene**, damit ein neu angelegtes
  Formular nicht still für alle unsichtbar ist. Auf einer Seite läuft
  `requireArea` **zusätzlich** zu `requireUser`/`requireRole`, nie an ihrer
  Stelle — die eine Frage ist „darf diese Rolle hier sein", die andere „bietet
  die Instanz ihr das noch an". Benannte **Vorlagen** (löschbar, drei
  mitgeliefert) legen eine gespeicherte Zusammenstellung auf eine Rolle — sie
  sind keine Rollen und gelten für jedes Konto darin. Details in
  `.claude/rules/visibility.md`.
- **Standard-Admin (Seeding):** `instrumentation.ts` ruft beim Serverstart
  `ensureDefaultAdmin()`. Tut nichts, solange die Instanz **irgendeinen** Admin hat —
  die Bedingung ist „null Admins", nicht „schon mal gelaufen", damit ein
  wiederhergestelltes Backup ebenfalls aufgeholt wird. Ohne Admin: existiert die
  Seed-Adresse schon, wird sie **hochgestuft** (Passwort bleibt unangetastet), sonst wird
  `admin@mits.local` mit `Admin123!` angelegt.

  Beides überschreibbar: `MITS_DEFAULT_ADMIN_EMAIL`, `MITS_DEFAULT_ADMIN_PASSWORD`.

  **Das eingebaute Passwort steht in diesem Repository und ist damit öffentlich.**
  Deshalb ist `must_change_password` ein echtes Gate, keine Anzeige:

  - `requireUser` leitet **jede** geschützte Seite auf `/settings/profile` um.
  - `requireApiUser` antwortet in **jedem** Route Handler mit `403`.
  - Nur `requireUserForPasswordChange` überspringt das Gate — der Name macht die
    Ausnahme an der Aufrufstelle sichtbar, und nur `/settings/profile` benutzt ihn.
  - Das Flag wird aus der **Datenbank** gelesen, nicht aus dem Session-Cookie: der
    Cookie-Cache lebt 60 s, das Konto wäre nach dem Wechsel noch eine Minute gesperrt.
  - `input: false` wie bei `role` — ein Client kann sein eigenes Gate nicht räumen.
    Gelöscht wird es ausschließlich von `changeOwnPassword`, also von dem Codepfad, der
    das Passwort tatsächlich geändert hat. Ein direkter Aufruf von
    `/api/auth/change-password` ändert das Passwort, räumt das Flag aber **nicht**.

  Das Seeding ist auf `NEXT_PHASE !== phase-production-build` beschränkt. `next build`
  versucht `/` zu prerendern und bricht erst beim Cookie-Zugriff ab — bis dahin ist
  Modul-Code schon gelaufen. Ohne den Guard läge eine geseedete `mits.db` im Image-Layer.
- **Sitzungsdauer: der Admin setzt die Grenze, die Person nimmt sie in Anspruch.**
  Unter „Anmeldung" in `/admin` steht `sessionLifetimeDays` — *Immer aktiv*, 30, 14,
  7 oder 1 Tag. Am Anmeldeformular steht der Haken **„Angemeldet bleiben"**, der die
  Dauer im Label nennt und **nicht vorbelegt** ist: Better Auths eigener Default ist
  `rememberMe: true`, hier ist er `false`, weil der ungünstige Fall ein geteilter
  Rechner ist. Ohne Haken bekommt die Sitzung ein Browser-Cookie ohne `Max-Age` und
  endet mit dem Fenster.

  **`auth` ist deshalb keine Konstante mehr, sondern `getAuth()`.**
  `session.expiresIn` liest Better Auth **einmal**, wenn `betterAuth(options)` den
  Kontext baut; ein Wert aus `mits_setting` wäre bis zum nächsten Serverstart
  wirkungslos, und ein Admin, der „7 Tage" einstellt und nichts passieren sieht,
  hält die Einstellung für kaputt. `getAuth()` merkt die Instanz am *Wert* und baut
  bei einer Änderung neu.

  Der naheliegende Weg — `expiresIn` groß lassen und `expiresAt` in
  `databaseHooks.session.create.before` kürzen — ist geprüft und falsch: Better Auth
  entscheidet über die Verlängerung mit `expiresAt - expiresIn + updateAge <= now`.
  Passen die beiden nicht zusammen, ist die Bedingung *immer* wahr und **jede
  Anfrage schreibt die Sitzungszeile neu** — auf einem Desk, dessen Queue im
  Sekundentakt nachfragt, ein Schreibvorgang pro Poll.

  `sessionLifetimeDays` läuft durch `toSessionLifetimeDays` statt als `z.enum`: ein
  abgelehnter Parse nähme die **ganze** Auth-Konfiguration mit, inklusive der
  Domain-Whitelist. Dieselbe Falle wie bei `hidden_areas` und `widget_order`.
- **Trusted Origins:** `trustedOrigins` ist eine **Funktion des Requests**, kein statisches
  Array. Better Auth vertraut sonst nur der `baseURL` plus `localhost` — für ein
  selbstgehostetes MITS unbrauchbar, weil der Hostname erst beim Deploy entsteht
  (`mits.firma.de`, eine LAN-IP, `dubuntulocal:3000`). Ohne das wäre `BETTER_AUTH_URL`
  eine Pflichtvariable und das Zero-Config-Deployment nicht zu halten.

  Abgeleitet wird aus `X-Forwarded-Host`, sonst `Host` — also aus dem Host, den der
  Client **angefragt** hat, mit beiden Schemata (hinter einem TLS-Proxy ohne
  `X-Forwarded-Proto` ist das Schema nicht bestimmbar, der Host trägt die Bedeutung).

  **Der `Origin`-Header wird niemals zurückgespiegelt.** Genau das wäre das Loch: bei
  einem CSRF-Angriff setzt der Browser `Origin: https://evil.example`, während `Host`
  diese Instanz bleibt — die zwei passen nicht zueinander, der Request fällt durch.
  Würde man `Origin` als vertrauenswürdig übernehmen, wäre `evil.example` per Definition
  vertrauenswürdig und die Prüfung wirkungslos. Host-Header-Injection greift hier nicht:
  MITS verschickt keine Mail, es gibt also keinen aus dem Host gebauten Link, den ein
  gefälschter Wert umlenken könnte.
- **Registrierung:** E-Mail + Passwort (min. 10 Zeichen), keine E-Mail-Verifikation
  (es ist kein Mailversand konfiguriert — eine aktivierte Verifikation würde alle
  aussperren). Das **erste** Konto einer Instanz wird immer angelegt und erhält
  `admin`; sonst hätte eine Instanz mit deaktivierter Registrierung nie einen Admin.
- **Privilege Escalation:** `role` ist ein `additionalField` mit `input: false` —
  ein `role: "admin"` im Sign-up-Body wird verworfen, nicht übernommen. Zusätzlich
  erzwingt der `databaseHooks.user.create.before`-Hook die Default-Rolle.
- **Rollenwechsel:** nur über `admin/actions.ts`. Der letzte Admin kann nicht
  herabgestuft werden, und niemand kann sich selbst die Admin-Rolle entziehen.
- **Domain-Whitelist:** Vergleich auf dem Teil nach dem **letzten** `@` und exakt —
  `firma.de` lässt weder `nichtfirma.de` noch `x@firma.de@fremd.de` zu.
- **Kein hardcodiertes Secret — nirgends.** `docker-compose.yml` hat **keine**
  Pflichtvariable, aber auch keinen Standardwert für ein Geheimnis: ein konstanter
  Fallback im Repo wäre Session-Forgery auf jeder Standardinstallation. Stattdessen
  erzeugt die Web-App beim ersten Bedarf `<data dir>/auth-secret` (Modus 0600) und
  `<data dir>/service-token` (0644), beides pro Instanz zufällig. `mits-backend`
  mountet dasselbe Volume read-only und liest den Token **lazy** über
  `expected_token()` — die Datei entsteht erst beim ersten KI-Aufruf, also nach dem
  Start des Backends. 0644 statt 0600, weil der Backend-Container unter einem anderen
  Benutzer läuft; kein Verlust, denn wer das Volume lesen kann, liest ohnehin
  `mits.db` mit den Sessions — und `mits-backend` veröffentlicht keinen Port.
  Umgebungsvariablen überschreiben beide Werte, falls die Dienste kein Volume teilen.
- **Ticket-Sichtbarkeit:** `listTicketsFor` entscheidet nach Rolle. `user` sieht nur
  eigene Tickets; `getTicketFor` antwortet bei fremdem Ticket mit `null` statt 403,
  damit sich keine IDs über den Statusunterschied ermitteln lassen.
- **Payload:** Die API validiert erneut gegen das Formularschema (`strictObject`),
  auch wenn der Browser das schon getan hat.
- **Anhänge:** Der gespeicherte Name wird **generiert** (UUID + geprüfte Endung), nie
  aus dem Upload abgeleitet — `../../server.js` kann das Upload-Verzeichnis nicht
  verlassen. Endungen sind eine Allow-List, der Content-Type kommt aus dieser Liste
  und nicht vom Browser. Ausgeliefert wird als Download
  (`Content-Disposition: attachment`, `nosniff`), damit ein hochgeladenes SVG oder
  HTML nicht im Origin der App läuft.

  **Die Ausnahme ist `?inline=1`, und sie gilt nur für Rasterbilder und PDF**
  (`isInlineViewable` in `lib/storage.ts`). Beide können kein Markup tragen, das
  dieser Origin ausführt — die Allow-List kennt weder SVG noch HTML —, und ein PDF
  läuft im eigenen Viewer des Browsers, der das einbettende Dokument nicht erreicht.
  Alles andere bleibt Download, auch mit dem Parameter: der Request kann sich die
  Inline-Auslieferung nicht selbst geben. Ohne diese Ausnahme gäbe es keine Vorschau
  im Chatverlauf, sondern nur „lade das herunter, um eine Zeile zu lesen".

  `linkUploadsToTicket` prüft beim Anlegen des
  Tickets, dass **jede** referenzierte `fileId` dem Aufrufer gehört und noch an
  keinem anderen Ticket hängt — sonst könnte man die Datei einer Kollegin ins eigene
  Ticket hängen und später über das Board lesen. Ticket-Insert und Bindung laufen in
  **einer** Transaktion.
- **Portal-Links:** `isSafeResourceHref` lässt nur `http`, `https` und Pfade ab `/`
  zu — geprüft beim Speichern **und** beim Lesen, weil eine handeditierte Zeile sonst
  ein `javascript:`-Ziel in jede Portal-Seite bringen würde.
- **Bestand löschen ist die einzige Aktion mit Passwortabfrage.** `purgeDataAction`
  (`/admin/settings/data`) setzt echte `DELETE`s ab, nicht `deleted_at`. Geprüft
  wird serverseitig: Admin-Rolle, das getippte Wort `löschen`, und das Passwort des
  Kontos gegen den gespeicherten Hash (`verifyUserPassword`). Die sechs Schritte im
  Dialog sind kein Schutz — wer die Action erreicht, überspringt sie —, deshalb
  liegen die zwei Prüfungen, die zählen, auf der Serverseite. Das Passwort ist das,
  was ein gestohlenes Sitzungscookie nicht hat, und ein im Besprechungsraum
  vergessener Laptop ist für ein Helpdesk-Admin-Konto das realistische Szenario.
  Protokolliert wird in das Containerlog, nicht in `mits_audit_log` — diese Tabelle
  ist eine der geleerten.

## Workflow

Nach jeder abgeschlossenen Phase committen und pushen:

```bash
git add -A
git commit -m "..."
git push origin main   # https://github.com/bohannjein/mits
```

## Verifikation

```bash
npm run typecheck    # Typen
npm run build        # Prod-Build
npm test             # beide Suiten
npm run test:forms   # reine Funktionen, offline
npm run test:db      # jeder Schreibpfad gegen eine Wegwerf-Datenbank
npm run dev          # http://localhost:3000
```

**`test:db` deckt ab, was ein Typechecker nicht kann:** den Vertrag zwischen
einem SQL-Statement und dem Objekt, das daran gebunden wird. Der ist auf der
einen Seite ein String und auf der anderen ein Typ, und nichts prüft, dass sie
zusammenpassen — better-sqlite3 zuckt bei einer Abweichung nicht mit den
Schultern, es wirft.

Das ist nicht theoretisch. Zwei Fehler, die alle drei anderen Befehle grün
passiert haben:

- `edited_at` an die Kommentarzeile geschrieben, ohne die Spalte ins `INSERT` zu
  nehmen → **jedes Absenden** war ein 500.
- Im `LIKE` der Ticketsuche hatte JavaScript zwei Backslashes gefressen, bevor
  SQLite sie sah: `ESCAPE ''` kam als `ESCAPE ''` an, und der Wildcard-Ersatz
  schrieb das literale `${c}` statt eines Escapes → **jede Freitextsuche** war
  ein 500, aus der Kopfzeile jeder Seite.

Die Suite ruft jeden Schreibpfad einmal mit realistischer Eingabe auf. Keine
Verhaltensprüfungen — dafür ist `test:forms` da. Diese hier stellt die eine
Frage, die ein Typechecker nicht stellen kann: läuft es überhaupt.

- **Läuft gegen ein temporäres `MITS_DATA_DIR`** und fasst die echte `mits.db`
  nie an. Deshalb ist jeder Import dynamisch: die Variable muss stehen, bevor das
  Datenbankmodul geladen wird.
- **Braucht `--conditions=react-server`.** Ohne das löst `server-only` auf seinen
  Client-Einstieg auf und wirft beim ersten Import.
- **Fixtures entstehen durch `Schema.parse({…})`**, nicht als handgeschriebene
  Literale. Sonst veraltet die Datei, sobald ein Schema ein Feld bekommt, und die
  Meldung wäre ein Compile-Fehler im Test statt eines Befunds am Produkt.
- **Die `user`-Tabelle legt Better Auths echter Migrator an**, nicht ein
  `CREATE TABLE` von Hand: die Spalten, gegen die der Ticket-Code joint, sind dann
  die, die auch in Produktion stehen.

**Test-Artefakte niemals ins Projektverzeichnis schreiben.** Tailwind v4 scannt das
Verzeichnis nach Klassen-Kandidaten. Ein gespeicherter HTML-Dump — oder ein Dev-Log, das
eine Fehlermeldung mit Klassennamen enthält — liefert dem Scanner Kandidaten, in denen die
Apostrophe eines Attribut-Selektors als HTML-Entity vorliegen (`&#x27;` statt `'`; hier
absichtlich nicht ausgeschrieben, damit diese Datei nicht selbst zum Kandidaten wird).
Daraus baut Tailwind einen ungültigen Selektor — `Invalid value in attribute selector` —,
der CSS-Build schlägt fehl, und **jede** Seite antwortet mit 500. Der Fehler ist
selbstverstärkend: er wird ins Log geschrieben, das Log speist den Scanner. Dumps und Logs
gehören nach `/tmp` bzw. in ein Scratchpad, nicht nach `./`.

Auth manuell prüfen: gegen ein Wegwerf-Datenverzeichnis starten, sonst landen
Testkonten in der echten Datenbank.

```bash
MITS_DATA_DIR=.tmp-e2e BETTER_AUTH_SECRET=$(openssl rand -hex 32) npx next dev -p 3100
```

Backend lokal ohne Docker:

```bash
python -m venv .venv && .venv/Scripts/pip install -r backend/requirements.txt
OLLAMA_BASE_URL=http://localhost:11434 MITS_SERVICE_TOKEN=dev \
  .venv/Scripts/python -m uvicorn main:app --app-dir backend --port 8000
curl http://localhost:8000/api/v1/health   # zeigt, ob Ollama und die Modelle da sind
```

Die Next-App braucht dann `MITS_BACKEND_URL=http://localhost:8000` und denselben
`MITS_SERVICE_TOKEN`.

Zu beachten, wenn Auth-Endpoints per `curl`/`fetch` angesprochen werden: Better Auth
lehnt zustandsändernde Requests ohne vertrauenswürdigen `Origin` mit
`403 INVALID_ORIGIN` ab. Das ist der CSRF-Schutz, kein Fehler — `Origin` **und** `Host`
mitschicken, und zwar passend zueinander:

```bash
curl -H "Origin: http://127.0.0.1:3100" -H "Content-Type: application/json" \
  -d '{"email":"…","password":"…"}' http://127.0.0.1:3100/api/auth/sign-in/email
```

**Nicht nur gegen `localhost` testen.** Better Auth vertraut diesem Namen per Default;
jeder andere Origin — `127.0.0.1`, eine LAN-IP, ein echter Hostname — geht den Weg über
`trustedOrigins` in `lib/auth/server.ts`. Ein Test ausschließlich gegen `localhost`
prüft genau den einen Fall, der ohnehin funktioniert, und lässt einen kaputten Deploy
durchgehen.

Regel-2-Check — muss leer bleiben. `mail-templates.ts` ist die dokumentierte Ausnahme
(siehe Regel 2), Doc-Kommentare mit `#1001` sind Ticket-Nummern und keine Farben:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(" src --include=*.tsx --include=*.ts \
  | grep -v "mail-templates.ts"
```
