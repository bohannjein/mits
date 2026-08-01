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

## Stack

| Ebene | Wahl |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, `src/`-Layout, Alias `@/*` |
| Styling | Tailwind v4 (CSS-Variablen, keine `tailwind.config.ts`) + shadcn/ui + Lucide |
| Motion | `framer-motion` — Spring-Physics, kein `duration`-Easing |
| Charts | `recharts` — Farben als CSS-Variablen, Animation zentral in `chart-kit.tsx` |
| Forms | `react-hook-form` + `zod`, eigener JSON-Schema-Renderer (Phase 2) |
| State | TanStack Query (Server-State) · Zustand (UI-State) |
| Auth | Better Auth 1.6 (E-Mail/Passwort), Rollen `user` < `agent` < `admin` |
| Persistenz | SQLite (`better-sqlite3`, WAL) in `<data dir>/mits.db` |
| Dateien | Platte in `<data dir>/uploads` **oder** S3 (MinIO/AWS/Hetzner), pro Datei gemerkt |
| Mail rein | IMAP (`imapflow`) oder Microsoft Graph, MIME über `mailparser` |
| KI-Backend | FastAPI in `backend/` — nur `fastapi`, `uvicorn`, `httpx`, `pydantic` |
| LLM | bestehende Ollama-Instanz, Adresse und Modelle **in der UI** konfiguriert |
| Deployment | `docker-compose.yml` im Root, Services `mits-web` + `mits-backend` |

`@shadcn/form` ist in der Registry vorhanden, aber ein leerer Stub (nur `name` + `type`,
keine `files`) — `shadcn add` legt daher nichts an. Ersatz liegt in
`src/components/forms/form.tsx`: `Form`, `FormField`, `FormItem`, `FormLabel`,
`FormControl`, `FormDescription`, `FormMessage` mit der kanonischen shadcn-API. Diese Datei
ist **unser** Code, nicht CLI-verwaltet — deshalb bewusst nicht in `components/ui/`.

## Struktur

```
Dockerfile.web             Multistage-Build der Next-App (Debian slim, nicht Alpine)
docker-compose.yml         Portainer-Stack: mits-web + mits-backend
.dockerignore              hält data/ und node_modules aus dem Build-Kontext
backend/
  main.py                  FastAPI: POST /api/v1/triage, GET /api/v1/health
  requirements.txt         vier Pakete, mehr braucht eine Begründung
  Dockerfile.backend       python:3.13-slim, unprivilegierter User
src/
  proxy.ts                 Route-Gate (Next 16: früher middleware.ts)
  instrumentation.ts       register(): Standard-Admin beim Serverstart
  app/
    globals.css            alle Design-Tokens
    page.tsx               Portal: angemeldet = Begrüßung + Kacheln + offene
                           Tickets + Banner + Schnellzugriffe;
                           abgemeldet = Login-Maske
    (auth)/login|register  Anmeldung / Registrierung
    settings/profile/      eigenes Profil + Passwortwechsel
    settings/actions.ts    changeOwnPassword (räumt must_change_password)
    forbidden/             Landung für angemeldet-aber-zu-wenig-Rechte
    tickets/page.tsx       eigene Tickets
    tickets/new/page.tsx   Ticket-Eingang (Tri-Modal)
    board/page.tsx         alle Tickets (technician + admin)
    admin/page.tsx         Registrierungspolicy + Rollen (admin)
    admin/portal/          Portal-Editor in vier Tabs: Layout & Texte, FAQ,
                           Betrieb, Meldungen & Kacheln (admin)
    admin/settings/ai/     Ollama-URL + Modellauswahl (admin)
    admin/forms/builder/   Split-Screen-Formular-Builder (admin)
    admin/actions.ts       Server Actions, prüfen die Rolle selbst
    api/auth/[...all]/     Better-Auth-Endpoints
    api/tickets/           Ticket-API (Scope aus der Rolle)
    api/tickets/upload/    Multipart-Upload für Anhänge
    api/uploads/[fileId]/  Download, pro Anfrage zugriffsgeprüft
    api/ai/triage/         Session-geprüftes Gateway zum FastAPI-Backend
    api/admin/ai-models/   fragt Ollama nach installierten Modellen (admin)
    api/admin/form-schemas/[id]/  lädt ein Schema in den Builder (admin)
  components/
    branding/              ThemeProvider, ThemeToggle (Hell/Dunkel/System), MITSLogo
    feedback/              toast.tsx (Overlay + useToast), notification-watcher
    dashboard/             announcement-banner, resource-grid,
                           portal-actions (Client: die zwei Portal-Kacheln),
                           open-tickets-panel (Client: Live-Liste per TanStack Query),
                           faq-accordion (Client), service-status,
                           maintenance-notice
    admin/                 … portal-layout-form (Widgets + Texte),
                           faq-editor, portal-operations-form
    layout/app-header.tsx  Header (Server Component) mit UserMenu
    providers/             QueryProvider
    auth/                  login-form, register-form, user-menu
    admin/                 registration-settings-form, user-role-form,
                           portal-content-form, schema-builder
    forms/
      form.tsx             RHF-Primitives (Ersatz für @shadcn/form)
      schema-form.tsx      <SchemaForm> — die einzige Formular-Komponente
    tickets/
      ticket-frame.tsx          fixe Ticket-Seite: Kopf, scrollender Verlauf, Antwortzeile
      ticket-live.tsx           SSE-Signal, sonst Fingerabdruck-Poll
      queue-live.tsx            SSE-Signal, sonst ETag gegen /check-updates
      message-actions.tsx       Bearbeiten + 15-s-Rücknahme an der eigenen Bubble
      ticket-shortcuts.tsx      r | m | i | Esc auf der Ticketseite
      queue-shortcuts.tsx       j | k | Enter | c über der Tabelle
      composer-handle.tsx       Context: Kuerzel erreicht die Antwortzeile
      ci-icon.tsx               ein Icon je Objektart
      detached-ticket-provider.tsx  welches Ticket ausgedockt ist, tabuebergreifend
      floating-ticket.tsx       angepinntes Panel, iframe auf die Popout-Route
      ticket-cutout.tsx         Platzhalter statt Verlauf und Antwortzeile
      detach-buttons.tsx        Anpinnen | eigenes Fenster, plus p
      popout-announcer.tsx      meldet dem Oeffner das Schliessen
      ticket-resources.tsx      Dateien und Links des Tickets
      withdraw-ticket.tsx       Melder zieht sein eigenes Ticket zurück
      ticket-messages.tsx       nur die Bubble-Liste, beide Ansichten
      ticket-composer.tsx       nur die Antwortzeile, rich | plain
      tri-modal-container.tsx   Tabs: Schnellmeldung | Katalog | KI, POST /api/tickets
      chat-intake.tsx           Composer-Maske für die Schnellmeldung, Pills + Drop-Zone
      chat-bubble.tsx           eine Nachricht; tone = wer sprach, side = wo sie sitzt
      service-catalog.tsx       Kategorie-Kacheln → SchemaForm
      ai-chat-tab.tsx           Freitext + Drag&Drop, Triage-Vorschau
      draft-receipt.tsx         validierter Entwurf als JSON
      ticket-table.tsx          Listing für /tickets und /board
    ui/                    shadcn-Primitives — nur per CLI ändern/ergänzen
  lib/
    auth/roles.ts           Rollen + Hierarchie (frei von Node-Imports!)
    auth/secret.ts          Datenverzeichnis + Session-Secret (kein DB-Import!)
    auth/bootstrap.ts       Seed-Fenster für den Standard-Admin (importfrei!)
    auth/server.ts          betterAuth-Konfiguration + Schema-Bootstrap
    auth/seed-admin.ts      ensureDefaultAdmin + clearMustChangePassword
    auth/session.ts         requireUser / requireRole / requireApiUser /
                            requireUserForPasswordChange
    auth/client.ts          Browser-Client (signIn/signUp/signOut)
    db/sqlite.ts            Verbindung + MITS-Tabellen
    settings.ts             Registrierungspolicy (mits_setting)
    ai-settings.ts          Ollama-URL + Modelle (mits_setting), Env als Fallback
    portal.ts               Banner, Schnellzugriffe, Layout, FAQ, Status,
                            Wartung — fünf Keys in mits_setting
    form-schemas.ts         Schema-Store: Built-ins + DB-Overrides
    storage.ts              Datei-Ablage auf Platte + Zugriffsprüfung
    users.ts                Benutzerliste + Rollenwechsel
    tickets.ts              Persistenz + Zugriffsregeln + Anhang-Bindung
    forms/schema-to-zod.ts  JSON Schema → zod, Feldauflösung, pickSchemaFields
    forms/registry.tsx      Widget → shadcn-Control
    ai/extract.ts           Client-Aufruf der Triage + fileToBase64
    store/intake-store.ts   Zustand: aktiver Modus, gewähltes Schema
    mock-schemas.ts         Beispiel-Schemata (Backend-Ersatz)
    icons.ts                erlaubte Lucide-Icons für schema.icon
    utils.ts                cn()
    ticket-sort.ts          Sortier-Whitelist + ORDER BY + Header-Links (kein server-only!)
    ticket-paging.ts        Seitengröße, Clamping, Seitenfenster (kein server-only!)
    ticket-opening.ts       Erstnachricht aus dem Payload ableiten (rein, offline geprüft)
    services/ai/provider.ts    Ollama | OpenAI | Anthropic über fetch, JSON erzwungen
    services/ai/similarity.ts  Ticket-Gruppierung, rein und ohne Modell
    services/ai/clustering.ts  Kandidaten, Ausblendungen, Hauptstörung anlegen
    services/ai/summary.ts     Problem / Schritte / Stand, nie gespeichert
    services/ai/routing.ts     Tags + Routing-Hinweis, blockiert nichts
    services/ai/tags.ts        Tag-Normalisierung (kein server-only!)
    services/ai/deflection.ts  FAQ-Treffer, lexikalisch, rein
    analytics/range.ts         Zeiträume, Granularität, Buckets (rein, offline geprüft)
    analytics/queries.ts       acht Aggregationen über Ticket, Kommentar und Audit
    analytics/export.ts        CSV-Serialisierung mit RFC-4180-Escaping (rein)
    analytics/settings.ts      Widget-Schalter und Default-Intervall
    worklogs.ts             erfasste Zeit, Summe immer als SUM() gelesen
    macros.ts               Makro-Store + Runner über die normalen Mutatoren
    notifications.ts        Feed für die Einblendungen, Sichtbarkeit je Abfrage neu
    notification-settings.ts Kanäle, Darstellung, Schwelle (mits_setting)
    notification-digest.ts  zählt und formuliert (rein, kein server-only!)
    realtime-backoff.ts     Reconnect mit Jitter (kein server-only!)
    shortcuts.ts            swallowsKeys + Kuerzel-Referenz (kein server-only!)
    template-values.ts      ein Aufloeser fuer {{kunde.vorname}} & Co.
    retract-window.ts       15 s, Countdown und Prüfung (kein server-only!)
    ticket-resources.ts     Links aus Nachrichten ziehen (kein server-only!)
    services/realtime.ts    Event-Bus: In-Process plus Pump pro Prozess
    services/analytics-cache.ts  30-s-Cache vor den teuren GROUP BY
    services/ai/digest.ts   schreibt die Sammelmeldung um, fällt immer zurück
    services/storage.ts     Backend-Weiche Platte | S3, pro Datei gemerkt
    services/s3.ts          PUT/GET/DELETE, fail closed
    services/s3-sign.ts     SigV4, rein und gegen AWS-Vektoren geprüft
    services/mail-inbound.ts IMAP + Graph, quittiert erst nach dem Schreiben
    mail/inbound-parse.ts   Antwort oder neues Ticket? Rein, offline geprüft
    mail/ingest.ts          schreibt, was inbound-parse entschieden hat
    cmdb.ts                 Objekte, Beziehungen, Plätze, Ticket-Zuordnung
    cmdb-import.ts          ein Importpfad für CSV und API
    cmdb-api.ts             Guard + Wire-Format der REST-Endpunkte
    csv.ts                  Parser + Wertumwandlung (kein server-only!)
    organizations.ts        Firmen
    api-tokens.ts           CMDB-Token: erzeugen, rotieren, prüfen
  types/mits.ts            MITSTicket, MITSFormSchema, MITSUser, AuthSettings
scripts/verify-forms.mts   Checks für den Schema-Compiler (`npm test`)
```

`lib/auth/roles.ts` und `lib/auth/secret.ts` importieren bewusst **keine** Datenbank:
`src/proxy.ts` zieht beide, und der SQLite-Treiber im Proxy-Bundle wäre fatal.
Alles unter `lib/` mit DB-Zugriff trägt `import "server-only"`.

### Ein neuer Ticket-Typ

Zwei Wege, beide ohne Komponenten-Code:

1. **Im Builder** (`/admin/forms/builder`) anlegen — landet in `mits_form_schema`.
2. **Im Code**: Schema zu `BUILTIN_SCHEMAS` in `src/lib/mock-schemas.ts` hinzufügen.

Ein DB-Eintrag mit derselben ID **überschreibt** das eingebaute Schema; `deleteStoredSchema`
stellt das eingebaute wieder her. Labels für Enum-Werte stehen in `uiHints.optionLabels`,
damit `schema` reines JSON Schema bleibt (kein `enumNames`). Ein neues Widget braucht einen
Eintrag in `MITSFieldWidget` **und** in `FIELD_REGISTRY`.

**Schemata immer über `lib/form-schemas.ts` auflösen, nie über `mock-schemas.ts`** — sonst
sind Builder-Änderungen unsichtbar. Client-Komponenten bekommen die Liste als Prop von der
Seite; sie dürfen den Store nicht selbst lesen (`server-only`).

## Modulares Portal

Die Startseite ist nicht verdrahtet, sondern konfiguriert. `portal_config` in `mits_setting`
bestimmt, welche Widgets es gibt, in welcher Reihenfolge und unter welcher Überschrift;
`page.tsx` baut eine `Record<PortalWidgetKey, ReactNode>` und rendert daraus nur, was
`widget_order.filter(enabled_widgets)` übrig lässt. Eine Instanz anzupassen ist damit eine
Admin-Aufgabe, kein Commit.

| Setting-Key | Inhalt |
|---|---|
| `portal` | Systemmeldungen + Schnellzugriffe (unverändert) |
| `portal_config` | Hero-Texte, `ticket_button_label`, `enabled_widgets`, `widget_titles`, `widget_order` |
| `portal_faqs` | FAQ-Einträge, `order_index` beim Speichern aus der Listenposition neu geschrieben |
| `portal_status` | Dienste + Zustand für das Systemstatus-Widget |
| `portal_maintenance` | Angekündigte Wartungsfenster |

Fünf Keys statt ein Blob, weil jeder Editor eigenständig speichert — zwei Admins in zwei
Tabs überschreiben sich nicht gegenseitig unbeteiligte Abschnitte.

**`hero_title` und `hero_subtitle` kennen `{name}`** (Vorname aus der Session). Ohne
Platzhalter bleibt der Text für alle gleich; für anonyme Besucher löst `{name}` zu nichts auf.

**Ein Widget ohne Inhalt rendert `null`**, auch eingeschaltet — dieselbe Regel wie bei
`ResourceGrid` und `AnnouncementBanner`. Eine frische Instanz zeigt deshalb nur FAQ und
Tickets, nicht vier leere Karten.

### Zwei Zod-4-Fallen, die hier zweimal zugeschlagen haben

`PortalConfigSchema` normalisiert absichtlich statt zu validieren, und das braucht die
richtigen Zod-Bausteine:

- **`z.record(Enum, …)` ist in Zod 4 exhaustiv.** Ein `widget_titles` mit nur einem Key
  scheitert am Parse — und ein gescheiterter Parse verwirft die *ganze* Config, also auch
  Reihenfolge und Schalter. Deshalb `z.partialRecord`.
- **`z.array(Enum)` lehnt ein unbekanntes Element ab**, statt es die Transform verwerfen zu
  lassen. Deshalb ist `widget_order` ein `z.array(z.string())`, das in der Transform gegen
  `PortalWidgetKey` filtert. Sonst nimmt ein in einer späteren Version entfernter
  Widget-Key das komplette Layout mit.

Beide Fälle sind in `scripts/verify-forms.mts` abgedeckt (`npm test`). Sie haben kein
sichtbares Fehlerbild: ein Portal, das still auf Default-Widgets zurückfällt, sieht aus wie
ein Portal, das nie konfiguriert wurde.

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

Umgeschaltet wird über `ThemeToggle` im Header und unter „Erscheinungsbild“ in
`/settings/profile`; gespeichert wird in `localStorage`, nicht in `mits_setting`
— das ist eine Eigenschaft dieses Browsers, nicht der Person.

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
| — | 16-stellige Ticketnummern ab 1 (Anzeigebreite, keine Kapazität) | ✅ |
| — | CMDB: Firmen, Objekte, Beziehungen, Lizenzen, Import, REST (12. Flag) | ✅ |
| — | Dual-Theme, Rollen-Rename, Bubbles, Toasts, Queue, Zeit, Makros, S3, Mail-Abruf | ✅ |

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

**Der Speicherort steht an jeder Datei, nicht nur in der Einstellung.**
`mits_upload.storage` entscheidet beim Lesen. Würde stattdessen die aktuelle
Einstellung gelten, wäre im Moment des Umschaltens auf S3 das komplette bestehende
Archiv 404 — bei einer Seite, die „gespeichert“ meldet.

**SigV4 ist selbst gebaut** (`lib/services/s3-sign.ts`), gegen die AWS-Testvektoren
in `npm test` geprüft. Das AWS-SDK wären zwanzig Megabyte für drei Request-Formen.
Der Grund für die Vektoren: eine falsche Signatur kommt als
`SignatureDoesNotMatch` zurück und sagt nichts darüber, welcher der sechs Schritte
schiefging.

**Es gibt keinen Mail-Timer im Prozess.** Ein `setInterval` liefe je Node-Worker —
zwei Worker heißt jede Mail zweimal, also jedes Ticket doppelt. Getrieben wird über
`POST /api/mail/poll` mit dem Service-Token (oder dem Admin-Button). Eine Nachricht
wird erst **nach** dem erfolgreichen Schreiben als gelesen markiert; andersherum
verlöre ein fehlgeschlagener DB-Write die Mail lautlos.

**Mail-Eigentümerschaft kommt nie aus der Nachricht.** Kennt MITS die Absenderadresse,
ist es deren Ticket. Sonst läuft es unter dem konfigurierten Auffang-Konto, während
`created_by_email` die echte Adresse behält — Sichtbarkeit beim Konto, Antwortweg
beim Menschen. Ein unauthentifizierter Absender legt **kein** Konto an. Die beiden
schmalen Ausnahmen heißen `MailIngestOrigin` und `MailAuthorOrigin` und sind
absichtlich benannt statt in ein Options-Objekt gesteckt.

**Eine gemailte Antwort ist nie Team.** `addComment` setzt `author_is_agent` auf
`false`, sobald ein `origin` mitkommt — sonst stünde eine Kundenantwort, die unter
einem Agenten-Auffangkonto abgelegt wird, rechts in der Agenten-Bubble, und die
Benachrichtigungsregel schickte dem Melder seine eigenen Worte zurück.

**Makros senden nur, wenn ein Admin das so eingestellt hat.** `reply_mode: "insert"`
ist Default und folgt der Hausregel. `"send"` ist die dokumentierte Ausnahme: der
bestätigende Mensch ist dann der Admin, der den Text geschrieben und das Makro so
markiert hat — nicht der Client. `saveMacrosAction` lehnt wirkungslose Makros und
tote Baustein-Verweise ab; ein Makro, das „ausgeführt“ meldet und nichts bewegt,
ist schlechter als kein Knopf.

**Der Toast liegt in `components/feedback/`, nicht in `components/ui/`.** Regel 1:
`ui/` ist CLI-verwaltet, und shadcn hat kein `toast` mehr (die Registry zeigt auf
`sonner`). Gleiche Begründung wie bei `components/forms/form.tsx`.

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

## Bedingte Felder und abhängige Auswahl

`uiHints[feld].visibleWhen` und `uiHints[feld].optionsFrom` steuern beides. Der Punkt, der
zählt: **beide werden aus den Antworten abgeleitet, nie aus einer Angabe des Clients.** Der
Browser blendet aus, und der Server kommt mit derselben Payload unabhängig zum selben
Ergebnis — `createTicket` gibt `values: draft.payload` an `schemaToZod`. Ein Client, der
behauptet „das war versteckt“, wird nicht gefragt.

Ohne das wäre es kaputt in beide Richtungen: ein verstecktes **Pflichtfeld** würde
serverseitig weiter verlangt und das Formular ließe sich nie absenden, und eine Antwort auf
eine nie gestellte Frage käme unbemerkt in die Datenbank.

- **Sichtbarkeit ist keine Sicherheitsgrenze.** Ein verstecktes Feld ist aus dem kompilierten
  Schema entfernt und seine Antwort wird vor dem Absenden verworfen — aber ein handgebauter
  Request kann das Feld trotzdem mitschicken. Grenze bleibt `strictObject` in `createTicket`.
- **Auflösung als Fixpunkt, nicht in einem Durchlauf.** Eine Bedingung darf auf ein selbst
  bedingtes Feld zeigen, und ein verstecktes Steuerfeld gilt **nicht** als Treffer — sonst
  bliebe ein Feld sichtbar wegen einer Antwort auf eine Frage, die nie gestellt wurde. Ein
  Zyklus endet mit beiden versteckt statt in einer Endlosschleife.
- **Werte werden als String verglichen.** Eine Bedingung auf Checkbox/Schalter lautet
  `equals: ["true"]`. Ein Array-Steuerfeld (Multiselect) trifft, wenn **ein** gewählter
  Eintrag gelistet ist. Leerer String trifft nie.
- **Eine Kaskade spiegelt die Vereinigung ihrer Werte ins `enum` des Feldes.** Sonst
  beschreibt das an Ollama gegebene Schema ein Freitextfeld und das Modell erfindet Werte,
  die nichts annimmt.
- **`saveFormSchemaAction` lehnt Bedingungen auf nicht existierende Felder ab**
  (`danglingConditions`). Ein toter Verweis versteckt sein Feld dauerhaft; ist es ein
  Pflichtfeld, ist das Formular für alle unabsendbar — und nichts auf dem Schirm erklärt es.
- **`feature_advanced_form_builder` schaltet nur das Bearbeiten ab, nicht die Auswertung.**
  Ein Admin-Schalter darf nicht die Pflichtfelder bereits veröffentlichter Formulare
  verändern; sonst kippen Formulare, die niemand angefasst hat.

**`location` und `user` sind Picker, keine Fremdschlüssel.** Ihre Optionen kommen zur
Laufzeit aus `mits_location` bzw. der Benutzerliste und werden per Context übergeben — nicht
ins Schema einbetoniert, sonst wäre die Liste nach jeder neuen Filiale veraltet. Validiert
wird als String: ein `enum`, das beim Anlegen des Formulars festgeschrieben würde, würde die
Payload jedes bestehenden Tickets ungültig machen, sobald ein Standort umbenannt wird. Der
geprüfte Standort ist die Spalte `mits_ticket.location_id`, nicht dieses Payload-Feld.
Personen gehen **nur mit Id und Name** an den Browser — `listUsers()` liefert auch Adresse
und Rolle, und ein Ticketformular hat keinen Grund, jedem Melder ein Adressbuch zu geben.

## CMDB

Anlagen, Lizenzen und Firmen. Fünf Tabellen, ein Modul, hinter `feature_cmdb`.

| Tabelle | Inhalt |
|---|---|
| `mits_organization` | Firmen — Eigentümer von Objekten, Zuordnung für Anwender |
| `mits_configuration_item` | **jede** Objektart, Unterschiede in `attributes` (JSON) |
| `mits_ci_relation` | gerichtete Beziehungen, Umkehrung beim Lesen abgeleitet |
| `mits_ticket_ci` | welche Objekte ein Ticket betrifft, Paar als Primärschlüssel |
| `mits_user_profile.organization_id` | Firma einer Person (Spalte, keine eigene Tabelle) |

**Firma ist nicht Standort.** Eine Firma hat mehrere Niederlassungen, ein geteiltes
Gebäude beherbergt mehrere Firmen. Zusammenlegen war die naheliegende Abkürzung und
hätte „alle Objekte von Kunde X" unbeantwortbar gemacht.

**Eine Tabelle für alle Objektarten.** Was ein Notebook von einer Lizenz unterscheidet,
sind die Attribute — dieselbe Begründung wie bei schema-first Ticket-Typen: kein
`Laptop.tsx`, kein `mits_laptop`. Eine Spalte bekommt nur, was gefiltert oder sortiert
wird.

**Lizenzplätze werden nie gespeichert.** `seatCounts` zählt die `licensed_for`-Beziehungen
aus der Lizenz heraus; „belegt" ist eine Folge von Zuordnungen. Ein gespeicherter Zähler
plus eine Beziehungstabelle laufen beim ersten gelöschten Gerät auseinander, und die
Differenz wäre eine Compliance-Angabe, die niemand nachrechnet. Ein Ziel, das
soft-deleted ist, zählt nicht mit — der Platz wurde frei, als das Notebook verschrottet
wurde.

**`organization_id` am Profil ist nicht über `setUserProfile` schreibbar.** Der Parameter
lässt das Feld weg (`Omit<…, "organization_id">`), ein Aufruf mit Firma kompiliert nicht.
Nur `setUserOrganization` bewegt jemanden zwischen Firmen, und dieser Pfad prüft auf
Admin. Wer sich selbst in eine fremde Firma setzen könnte, würde deren Objektliste
filtern.

**Löschen:** Eine Firma wird verweigert, solange Objekte oder Personen daran hängen —
der Admin erfährt, was im Weg ist, statt eine stille Enteignung zu bekommen.
Deaktivieren bleibt der Normalweg. Ein Objekt wird soft-deleted (`deleted_at`, wie
Tickets), seine Beziehungen und Ticket-Zuordnungen dagegen echt gelöscht: das Objekt
trägt die Historie, die man zurückhaben will, eine Beziehung darauf nicht.

### Import und Schnittstelle

**Ein Codepfad für CSV und API.** `importItemRecords` nimmt `ImportRecord[]`; der
CSV-Importer bildet Spalten darauf ab, die API JSON-Felder. Alles danach — Abgleich per
Inventarnummer, Auflösung von Firma/Standort/Konto, Beibehalten nicht gelieferter Felder
— passiert einmal. Zwei Implementierungen von „aktualisiere das Objekt mit dieser
Nummer" unterscheiden sich genau in der Regel, auf die es ankommt.

**Alle Werte sind Strings**, auch Platzzahlen und Datumsangaben. Damit kann die API keine
Datumsform annehmen, die der CSV-Weg ablehnt.

**Zweimal geparst, absichtlich.** Die Maske parst im Browser für Kopfzeilen und Vorschau,
der Server erneut aus demselben Rohtext. Die Zeilen des Clients werden nie gesendet.
`lib/csv.ts` trägt deshalb **kein** `server-only` — drei Aufrufer (Maske, Server,
Offline-Suite), ein Parser.

**Weiche Fehler statt verworfener Zeilen.** Unbekannte Art → `other`, unbekannter Zustand
→ `active` (nicht `retired`: ein falsch als verschrottet importiertes Gerät verschwindet
unbemerkt aus Bestand und Lizenzzählung). Unauflösbare Firma → Feld leer plus Meldung.
Importiert wird Zeile für Zeile, nicht als eine Transaktion — ein echter Export ist
dreckig, und alles-oder-nichts scheitert bei Zeile sechshundert.

**Die API ist fail closed.** Kein hinterlegter Token heißt, Token-Authentifizierung ist
unmöglich, nicht dass sie übersprungen wird. Vergleich mit `timingSafeEqual` nach
Längenprüfung. Der Token wird genau einmal angezeigt — beim Erzeugen; danach ist nur
sichtbar, *dass* einer existiert. `/api/v1/*` liegt außerhalb des `proxy`-Matchers, ein
Maschinenaufruf bekommt also JSON statt eines Redirects auf die Anmeldung.

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
/admin/settings/storage Dateispeicher (Platte oder S3)
/admin/settings/analytics Widget-Schalter und Default-Intervall
/admin/settings/notifications Kanäle, Darstellung, Sammelmeldung
/admin/mail             Postfach-Abruf + Defender-Regel
/api/notifications      Feed für die Einblendungen, `?since=` (jede Rolle)
/api/realtime/stream        SSE-Signale: ticket | notify | queue
/api/tickets/check-updates  Queue-ETag, antwortet 304 wenn nichts anders ist
/api/tickets/[id]/activity  Fingerabdruck, Ersatzweg wenn der Stream fehlt
/api/notifications/digest   Sammelmeldung ab der eingestellten Schwelle
/api/analytics          Kennzahlen als JSON oder `?format=csv` (Agenten)
/api/mail/poll          Postfach abrufen, Service-Token **oder** Admin-Sitzung
/api/v1/cmdb/…          REST-Schnittstelle, Token **oder** Agenten-Sitzung
```

**Eintrittsweg und In-App-Navigation sind zwei verschiedene Ziele.** Wer den bloßen
Host aufruft, will das Portal — `/`, `/login` und `/register` schicken **jeden** nach
`/customer`, auch die Technik. Innerhalb der App entscheidet weiter `homeFor(role)`:
Logo und Benutzermenü bringen einen Techniker zurück in die Queue, nicht ins Portal,
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
die Sitzung neu aufbauen, sonst sieht ein frisch befördeter Techniker weiter `/forbidden`.

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

## Statistiken

`/mits/analytics`, Agenten und Administration. Gesteuert unter
`/admin/settings/analytics`: Default-Intervall plus acht Widget-Schalter, alle an.

**Anwender kommen nicht rein — an drei Stellen.** `requireRole("agent")` auf der
Seite, `requireApiRole("agent")` auf `/api/analytics`, und kein Link: der
Statistik-Knopf sitzt in `/mits`, wohin das Benutzermenü einem `user` ohnehin
keinen Weg zeigt. Die Seite zu verstecken und die Route offen zu lassen wäre
sinnlos — die Zahlen liegen in der Route.

**Das Panel ist eine Client-Komponente mit einem Endpunkt**, anders als jede
andere Liste in MITS. Grund ist der Auto-Refresh: eine sich neu ladende Seite
würde bei jedem Tick alle Charts neu mounten, und genau das harte Springen soll
weg. Über TanStack Query landen neue Zahlen in *denselben* Chart-Instanzen und
recharts morpht. `placeholderData` hält die alten Daten stehen, während die
neuen kommen — sonst leert jeder Filterwechsel neun Karten und füllt sie wieder.

**Serien enthalten jeden Bucket, auch die leeren.** Zwei Gründe, beide wichtig:
ein Chart nur aus Buckets mit Daten zieht eine gerade Linie über ein
ticketfreies Wochenende, und recharts kann nur zwischen Arrays gleicher Form
interpolieren — bei wechselnder Länge bleibt ihm nur Neuzeichnen.

**Alles UTC.** Zeitstempel sind ISO-Strings und werden als Strings verglichen, also
muss eine Bucket-Grenze UTC-Mitternacht sein. Die Anzeige-Zeitzone ist eine
*Render*-Einstellung und greift hier absichtlich nicht durch; das Panel sagt es
einmal, statt jede Grenze zweimal im Jahr still zu verschieben.

**Lösungszeit und Erstreaktion kommen aus `mits_audit_log` beziehungsweise
`mits_ticket_comment`,** nicht aus einer Spalte. Eine Spalte wäre eine zweite
Wahrheit. Die Folge steht im Panel: ein vor Einführung der Historie geschlossenes
Ticket zählt nicht mit, die Datenbasis ist kleiner als die Ticketzahl.

**Median *und* Mittel.** Sie widersprechen sich hier auf eine Art, die zählt: ein
über Weihnachten offenes Ticket verschiebt das Mittel um Tage und den Median gar
nicht.

**Gelöst-je-Agent hängt am Akteur im Audit-Log**, nicht an `assigned_to` — wer
geklickt hat, hat es getan, und ein Ticket wechselt vor dem Abschluss auch mal
zweimal den Besitzer.

**Die Heatmap ist ein CSS-Grid, kein recharts-Chart.** recharts hat keine
Heatmap, und eine aus einem Scatter mit quadratischen Shapes zu bauen kämpft
gegen die Bibliothek für ein schlechteres Ergebnis als 168 gestylte Zellen.

**Chart-Farben sind Tokens.** `--chart-1..6` und `--heat-0..4`, je Theme eigene
Werte — recharts nimmt `var(--chart-1)` direkt als `fill`. Die im Auftrag
genannten Hex-Werte sind die Light-Werte und stehen genau dort. Auf Dark sind sie
angehoben und leicht entsättigt: dasselbe Indigo, das auf Weiß souverän wirkt,
ist auf Beinahe-Schwarz ein Loch.

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

## Was hundert gleichzeitige Chatter kostet

Vier Stellen, an denen die Echtzeit teurer war als nötig. Alle vier folgen
derselben Regel, die auch WhatsApp, Signal und Threema befolgen: **ein Ereignis
ist keine Aufforderung, alles neu zu laden.**

**Ein Burst ist eine Aktualisierung** (`hooks/use-coalesced-refresh.ts`). Jeder
Kommentar veröffentlicht ein `queue`-Signal an jeden verbundenen Agenten, und
jeder beantwortete es mit einem vollen `router.refresh()` — das sind auf der
Queue sieben Abfragen gegen einen synchronen SQLite-Treiber, der dabei die
Event-Loop für alle anderen blockiert. Zehn Nachrichten pro Sekunde waren zehn
komplette Renders **pro offenem Tab**. Jetzt: 1,5 s Fenster auf der Queue, 0,5 s
im Ticket, und nie mehr als eine Aktualisierung gleichzeitig unterwegs. Unter
Dauerlast degradiert der Client auf „so schnell, wie der Server antwortet",
statt Arbeit aufzustauen, zu der der Server noch nicht gekommen ist.

**Ein verborgener Tab gibt seine Verbindung zurück.** Das ist die Stelle, die
darüber entscheidet, ob MITS es übersteht, offen gelassen zu werden: über
HTTP/1.1 erlaubt ein Browser sechs Verbindungen pro Origin, und ein Event-Stream
ist eine Verbindung, die nie zurückkommt. Vier Tabs auf der Queue, und für die
Seitenaufrufe selbst bleibt nichts. Das Fehlerbild ist keine Meldung, sondern
eine Navigation, die hängt — nicht von einem langsamen Server zu unterscheiden.
Ein verborgener Tab hat niemandem etwas zu zeigen, also hält er auch nichts.

**Die Session wird einmal pro Anfrage aufgelöst** (`cache()` um
`getSessionUser`). Seit der Realtime-Provider im Root-Layout sitzt, taten es
Layout und Seite je einmal: zwei Better-Auth-Aufrufe, zwei Profil-Reads. Bei
einem synchronen Treiber blockiert jeder davon alle anderen.

**Die Aufräumlöschung des Event-Puffers läuft auf einem Timer**, nicht bei jedem
`publish`. Vorher war es ein zweiter Schreibvorgang pro Ereignis, also sechs pro
Kommentar statt drei.

**Neue Tickets melden sich jetzt überhaupt.** `createTicket` veröffentlichte
nichts — ein eingehendes Ticket erreichte die Queue erst über den Ersatz-Poll.
Das war eine Lücke, keine Entscheidung.

**Der Mailweg bleibt unverändert und funktioniert weiter.** Eine Antwort per
Mail geht durch `ingest` → `addComment`, und `addComment` veröffentlicht — sie
erscheint also live im Agenten-Chat wie jede andere Nachricht. Ausgehend
benachrichtigt `addCommentAction` weiter den Melder. Der Kunde chattet per Mail,
der Agent sieht einen Chat; daran ändert die Echtzeitschicht nichts, sie macht
den Weg nur schneller sichtbar.

### Warum eine geschlossene Meldung nicht in der Statistik stand

Nicht die Abfrage — die zählt `status_changed` mit `new_value IN ('closed',
'resolved')`, und beide Schließ-Wege gehen durch `setTicketStatus`, das den
Eintrag schreibt. Es war der **30-Sekunden-Cache**, den der Analytics-Schutz
mitgebracht hat.

Die Zahl war korrekt und der Cache tat seine Arbeit. Das Problem ist der
Zeitpunkt: der einzige Moment, in dem jemand eine Kennzahl nachsieht, ist direkt
nachdem er sie verändert hat — die einzige Veralterung, die je auffällt, ist
also genau die, die wie ein Fehler aussieht. `setTicketStatus`, `assignTicket`
und `createTicket` leeren den Cache jetzt.

Bei einem Kommentar bewusst nicht: das verschiebt zwar die Erstreaktionszeit,
aber niemand schließt ein Ticket und prüft danach den Median der Antwortzeiten.
Auf jeden Schreibvorgang zu leeren hieße, den Cache abzuschaffen.

## Ticket ausdocken: Pop-out und angepinntes Fenster

Zwei Wege aus dem Hauptfenster, **einer zur Zeit**. Zwei losgelöste Kopien
derselben Konversation heißen zwei Antwortzeilen, und die zweite ist immer die,
in die jemand tippt, obwohl sie ein paar Sekunden hinterherhängt. Erneutes
Ausdocken ersetzt, es addiert nicht.

| Weg | Was | Auslöser |
|---|---|---|
| `popout` | echtes Browserfenster, `window.open` | Knopf im Ticketkopf |
| `floating` | angepinntes Panel unten rechts | Knopf oder `p` |

**Das Panel ist ein `<iframe>` auf `/mits/tickets/[id]/popout`.** Das ist die
Entscheidung, die Begründung braucht, weil eine Komponente, die den Verlauf
direkt rendert, idiomatischer aussähe.

Der Verlauf wird serverseitig gerendert, und jede Regel darüber, wer was lesen
darf, liegt auf dieser Seite — `listCommentsFor` filtert interne Notizen in SQL,
`getTicketFor` antwortet bei fremdem Ticket mit `null`. Ihn im Client noch einmal
zu rendern hieße, einen zweiten Pfad zu haben, der Kommentare holt, und damit
eine zweite Stelle, die entscheidet, was herausgeht. Das ist der Fehler, den
dieses Projekt an jeder Stelle vermeidet, und ein iframe weniger ist ihn nicht
wert. Gleiche Origin, gleiches Session-Cookie, gleiche Guards, gleicher Stream.

**Die Pop-out-Route ist eine Route und wird wie eine bewacht.**
`requireRole("agent")` läuft dort ebenfalls. Erreichbar nur über einen Knopf auf
einer bewachten Seite zu sein, ist kein Schutz — es ist trotzdem eine URL, und
die Next-Docs sind eindeutig darüber, dass Proxy-Abdeckung lautlos verschwinden
kann.

Was dort **nicht** steht: Sidebar, Kopfleiste, Zurück-Link, überhaupt jede
Navigation. Ein 384 Pixel breites Panel mit einem Status-Dropdown darin ist ein
Bedienelement, dessen Beschriftung niemand lesen kann; und ein Pop-out, aus dem
man wegnavigieren kann, ist ein zweites Anwendungsfenster ohne Weg zurück. Der
Composer ist dort `plain` — die Formatierungsleiste bricht in dieser Breite auf
drei Zeilen um und frisst das Feld, zu dem sie gehört.

**Das Ausgeschnitten-Bild ersetzt Verlauf *und* Antwortzeile.** Den Composer
stehen zu lassen wäre genau die zweite Eingabe, die das Ganze verhindern soll.
Der Rest der Seite bleibt bedienbar, und die Karte sagt das auch.

**Der Zustand wird über einen `BroadcastChannel` geteilt**, nicht nur im eigenen
Tab. Ein zweiter Tab auf demselben Ticket zeichnet den Ausschnitt mit — sonst
zeigte er einen lebendigen Verlauf, den niemand liest, und eine dort getippte
Antwort ginge in ein Fenster, auf das der Mensch nicht schaut. Der Kanal trägt
eine Ticket-Id und einen Modus, sonst nichts.

**Ein Fenster, das über seine eigene Titelleiste geschlossen wird, meldet dem
Öffner nichts.** Deshalb zwei Wege: `PopoutAnnouncer` sendet auf `pagehide`
(nicht `beforeunload` — das wird gedrosselt, ohne Geste ignoriert und auf
Mobilbrowsern oft gar nicht ausgelöst), und der Provider pollt zusätzlich
`window.closed` im Sekundentakt. Zusammen verschwindet der Ausschnitt entweder
sofort oder innerhalb einer Sekunde — nie gar nicht.

**Das Panel darf sich nicht selbst enthalten.** Der Provider sitzt im Root, also
hat auch das Pop-out-Dokument einen, und der Kanal teilt ihm brav mit, dass ein
Ticket ausgedockt ist. Sein `FloatingTicket` öffnete dann ein iframe auf die
Pop-out-Route, deren Dokument dasselbe täte. Zwei Bedingungen halten das an, weil
die beiden losgelösten Ansichten verschieden sind: das Panel ist ein Frame
(`self !== top`), das Pop-out ein Top-Level-Fenster auf dem `/popout`-Pfad.

**`p` pinnt an, es öffnet kein Fenster.** `window.open` aus einem Tastendruck
blockiert jeder Popup-Blocker, der nichts anderes gelernt hat — Browser vertrauen
dafür nur einem Klick. Eine Taste, die auf der Hälfte der Installationen still
nichts tut, wäre schlechter als keine.

**Die Antwortzeile ist doppelt gesichert.** Ab `lg` ist sie ein `shrink-0`-
Geschwister des Scrollcontainers und kann sich schon deshalb nicht bewegen.
Darunter gibt es keine begrenzte Spalte, gegen die sich das halten ließe, und die
Zeile säße am Ende eines langen Verlaufs — dort und nur dort ist `sticky
bottom-0` das richtige Werkzeug: es hängt am Viewport, nicht an einem
Scrollcontainer, es gibt also keinen Sticky-Kontext, über den etwas uneinig sein
könnte. Deckend (`bg-background`) und `z-10`, weil Bubbles darunter durchlaufen.

## Tastatur zuerst

`hooks/use-keyboard-shortcuts.ts` ist ein `keydown`-Listener auf `window` und
eine Regel: `swallowsKeys` (`lib/shortcuts.ts`, rein, in `npm test`).

**Die Regel ist die ganze Sicherheit des Systems.** Zu großzügig, und ein `m`
mitten in einer Antwort weist das Ticket zu und verschluckt den Buchstaben — ein
stiller, falscher Schreibvorgang aus einem Tastendruck, der als Text gemeint war.
Vier Dinge zählen als Tippen, die letzten beiden werden vergessen:

- `<input>`, außer den Typen ohne Text. Ein Formular voller Schalter darf die
  Kürzel der Seite nicht abschalten.
- `<textarea>` und `<select>`.
- **`contenteditable`** — das ist der Rich-Text-Editor. Kein Input-Element, ein
  `instanceof HTMLInputElement` verfehlt ihn also vollständig, und er ist die
  wahrscheinlichste Stelle für ein getipptes `r`.
- Alles in einem offenen Dialog oder Menü. Radix setzt den Fokus auf ein `<div>`;
  ein Kürzel, das hinter einem Modal feuert, wirkt auf eine unsichtbare Seite.

`swallowsKeys` ist von `isTypingTarget` getrennt: die Entscheidung ist rein und
prüfbar, der DOM-Zugriff ist es nicht.

**Escape ist die Ausnahme von genau dieser Regel** und wird zuerst behandelt: es
ist die einzige Taste, deren Aufgabe darin besteht, aus dem Feld herauszuführen,
in dem man tippt. Es blurrt und löscht nichts — ein Kürzel, das eine halb
geschriebene Antwort verwirft, weil jemand aus Gewohnheit nach Escape greift,
wäre unverzeihlich.

| Wo | Taste | Was |
|---|---|---|
| überall | `Strg`+`K` · `?` · `Esc` | Suche · Hilfe · Feld verlassen |
| Queue | `J` `K` · `Enter` · `C` | Zeile tiefer/höher · öffnen · Zuständigkeit |
| Ticket | `R` · `M` · `I` | Antwortzeile · mir zuweisen · interne Notiz |

- **`m` schreibt aus einem Tastendruck**, als einziges. Vertretbar aus drei
  Gründen: Zuweisung ist mit einem Klick umkehrbar, `assignTicket` lehnt eine
  Nicht-Änderung ab, und `swallowsKeys` garantiert, dass die Taste kein
  Buchstabe war. Gegen eine gehaltene Taste sichert ein `busy`-Ref — ohne das
  postet ein aufgestützter Ellenbogen dieselbe Zuweisung dreißigmal.
- **Der j/k-Cursor ist ein DOM-Attribut**, kein React-State. `TicketTable` bleibt
  Server Component (die relativen Alter werden einmal beim Rendern gerechnet);
  sie für einen Rahmen zum Client zu machen hieße, fünfzig Zeilen Formatierung in
  den Browser zu verlegen. `data-cursor` wird gesetzt, `globals.css` malt.
- **Die Zeilen werden bei jedem Tastendruck neu gesucht.** Ein gecachtes
  `NodeList` zeigt nach dem nächsten Realtime-Refresh auf Elemente, die nicht
  mehr im Dokument sind — die Markierung bliebe einfach aus, ohne Hinweis.
- **`c` fokussiert, es schaltet nicht um.** „Pool" und „Mein Bereich" sind zwei
  benannte Ziele; eine Taste, die zwischen ihnen kippt, hat eine Wirkung, die
  davon abhängt, wo man schon war.
- **Die Hilfe ist geschrieben, nicht generiert.** Eine erzeugte Liste wäre ehrlich
  darüber, was gebunden ist, und nutzlos als Dokumentation — sie kann nicht
  sagen, was `c` bedeutet. `npm test` prüft dafür, dass keine Gruppe dieselbe
  Taste zweimal vergibt.
- **`Kbd` ist eine Komponente.** Drei handgebaute Kopien der Tastenkappe waren
  schon beim Padding auseinander. Unter `sm` versteckt, außer im Hilfe-Dialog,
  wo die Kappen der Inhalt sind.

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

## CMDB im Ticket

Die Objekte lagen schon da (`mits_configuration_item`, `mits_ticket_ci`,
`TicketAssets`). Neu ist, was daran fehlte:

- **Ein Icon pro Objektart** (`components/tickets/ci-icon.tsx`). Eine Liste von
  Inventarzeilen ist eine Liste von Namen, und `MITS-NB-0431` und `MITS-NB-0413`
  haben dieselbe Form. In einer eigenen Datei, weil drei Seiten dieselben Zeilen
  rendern — drei Kopien der Zuordnung wären drei Chancen, dass eine Lizenz
  irgendwo wie ein Notebook aussieht.
- **Vorschläge in zwei Gruppen** statt einer Liste: „Dem Melder zugewiesen" und
  „Am selben Standort". Sie verdienen unterschiedliches Vertrauen, und
  zusammengeworfen gewinnt der erste plausible Name — an einem geteilten Standort
  regelmäßig das falsche Gerät. Die Zuordnung des Melders greift zuerst nach den
  Ids, ein Notebook, das beides ist, ist seines.

**Keine zweite `assets`-Tabelle.** Der Auftrag nennt eine; es gibt sie bereits als
`mits_configuration_item`, und dass es *eine* Tabelle für alle Objektarten ist,
ist eine dokumentierte Entscheidung. Eine zweite hieße zwei Bestände, von denen
der Lizenzzähler nur einen sieht.

## Echtzeit: gepusht, wo es geht

Drei Wege, absichtlich verschieden, weil die drei Dinge verschieden teuer sind.

| Was | Wie | Kosten im Leerlauf |
|---|---|---|
| Chat + Toasts | SSE, `/api/realtime/stream` | eine offene Verbindung, keine Abfrage |
| Queue-Liste | SSE-Signal, Ersatz: ETag / `304` | eine Kopfzeile alle 15 s im Ersatzmodus |
| Statistiken | In-Memory-Cache, 30 s | eine Berechnung pro Intervall statt pro Leser |

**Signale, keine Daten.** Ein Event sagt „Ticket X hat sich bewegt" und trägt
keinen Inhalt. Der Client holt danach über die Route, die es ohnehin gibt — und
damit bleibt es bei **einer** Stelle, die über Sichtbarkeit entscheidet. Ein Bus,
der Nachrichtentexte verteilte, wäre die zweite, und die zweite ist die, die man
falsch macht.

**SSE statt WebSockets.** Der Verkehr ist einseitig, SSE ist eine gewöhnliche
HTTP-Antwort, die jeder Reverse Proxy schon weiterleitet, und `EventSource`
verbindet selbst neu. Ein WebSocket brächte einen Rückkanal, den es hier nicht
gibt, und eine Deployment-Notiz für jeden Proxy davor. `X-Accel-Buffering: no`
ist Pflicht: nginx puffert proxied Responses per Default, und ein gepufferter
Event-Stream liefert erst, wenn ein paar Kilobyte zusammen sind — der häufigste
Weg, wie SSE lokal funktioniert und in Produktion nicht.

**Zwei Zustellwege, weil Next mehrere Worker fahren kann.** Dasselbe Problem wie
beim Mail-Timer, von der anderen Seite: ein In-Process-Emitter erreicht die
Hälfte der Browser. Also schreibt `publish` zusätzlich in `mits_realtime_event`,
und **ein** Pump pro Prozess liest, was er nicht selbst geschrieben hat. Pro
Prozess, nicht pro Verbindung: hundert Tabs auf einem Worker kosten denselben
`id > ?`-Read alle zwei Sekunden wie einer. Ohne Verbindung läuft kein Pump.

Der stille Fehler, den das verhindert: Echtzeit funktioniert für jeden, der
zufällig denselben Worker hat wie der Schreiber, und für die anderen nicht. Das
ist schlimmer als keine Echtzeit, weil es nicht reproduzierbar ist.

**Das Ticket in `?ticket=` wird einmal beim Verbinden autorisiert**
(`getTicketFor`), nicht pro Event. Pro Event wäre ein DB-Read im Fan-out für
etwas, das sich bei offener Verbindung nicht ändern kann.

**Ein `EventSource` pro Tab**, im Root-Layout. Browser deckeln gleichzeitige
Verbindungen pro Origin, und ein Stream ist eine Verbindung, die nie zurückkommt.
Die Seite meldet über `useRealtimeTicket`, was sie ansieht; der Provider
verbindet dann neu.

**Fällt der Stream aus, laufen die alten Abfragen weiter** — Ticketseite 2,5 s /
12 s, Queue 15 s gegen den ETag. Echtzeit, die auf *nichts* zurückfällt, ist
schlechter als Abfragen, weil der Ausfall unsichtbar ist. Der Punkt im Header
sagt, welcher Modus läuft: grün live, gelb Ersatz, grau im Aufbau. Icon **und**
Farbe, weil `--success` und `--warning` das Paar sind, das rot-grün-blinde Leser
am wenigsten trennen können.

**Reconnect mit Jitter** (`lib/realtime-backoff.ts`, in `npm test`). Der Jitter
ist der Teil, der weggelassen wird: ohne ihn kommen vierzig Tabs nach einem
Neustart alle bei 1 s wieder, dann alle bei 2 s — genau im Takt, in dem der
Server sich zu erholen versucht. `EventSource` verbindet zwar selbst neu, aber in
festem kurzem Abstand und ohne Obergrenze; deshalb wird die Verbindung geschlossen
und die Zeit selbst gesteuert.

**Der ETag ist pro Benutzer**, und das ist tragend statt ordentlich: sein Wert
kommt aus Zeilen, die der Aufrufer sehen darf. Ein geteilter ETag verriete jedem,
der ihn beobachtet, die Aktivität aller anderen. `private, no-cache`, nicht
`no-store` — letzteres verbietet dem Browser das Behalten und damit die
Revalidierung, die den ganzen Mechanismus ausmacht.

**Der Queue-Fingerabdruck kommt nicht aus `mits_ticket.updated_at`.** Die Spalte
wird beim Insert geschrieben und nie wieder angefasst, ein Statuswechsel bewegt
sie also nicht. Stattdessen vier indizierte Aggregate über Ticket, Audit-Log und
Kommentare: jeder Mutator schreibt ohnehin ins Log, und einer, der das vergäße,
wäre auch ein fehlender Historieneintrag — ein Fehler, den jemand bemerkt.

**Der Analytics-Cache ist auf den Zeitraum geschlüsselt, nicht auf den Benutzer.**
Nur zulässig, weil diese Zahlen nicht gescoped sind: `/api/analytics` ist als
Ganzes agentengesperrt und jeder, der daran vorbeikommt, sieht dieselben Werte.
Käme je eine melderseitige Sicht dazu, muss der Schlüssel eine Benutzer-Id
bekommen. Die Widget-Schalter stehen mit im Schlüssel, sonst sähe ein Admin nach
dem Einschalten eine halbe Minute lang nichts und hielte den Schalter für kaputt.
`?refresh=1` leert den ganzen Cache, nicht nur den angefragten Eintrag — wer den
Knopf drückt, hat gerade etwas geändert und wechselt gleich darauf ebenso
wahrscheinlich den Zeitraum.

## Nachrichten korrigieren und zurückziehen

**Strg+Enter sendet, Enter nicht.** Auf dem Formular statt auf jedem Editor, also
aus Textarea und Rich-Text gleichermaßen. Blankes Enter absichtlich nicht: hier
stehen mehrzeilige Antworten mit Schritten drin, und ein Enter, das absendet,
macht aus jeder nummerierten Liste eine halbe Nachricht — im Postfach des Kunden.

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

## Der Statistik-Knopf sitzt am Tortendiagramm

Nicht mehr als Pille neben „CMDB" in der Queue-Kopfzeile. Zwei gleich große
Bedienelemente sagen, dass zwei Dinge gleich wichtig sind, und das sind sie
nicht: die CMDB ist ein Ort, an dem Agenten arbeiten, die Statistiken einer, an
den sie gelegentlich schauen. Der Link steht jetzt als Textlink über den Zahlen,
die er aufschlüsselt.

**Zusätzlich im Benutzermenü**, weil `StatsTiles` hinter
`feature_stats_heatmap` liegt — sonst hätte eine Instanz mit ausgeschaltetem
Widget ein Statistik-Panel ohne jeden Weg hinein. Gegated auf `canViewBoard`, wie
jeder andere Bereichswechsel dort.

## Benachrichtigungen: Kanäle wie auf dem Telefon

`/admin/settings/notifications`, instanzweit. Vier Darstellungswerte (Ecke,
Anzeigedauer, Stapelhöhe, Abfrageintervall), drei Kanäle mit je Schalter,
Farbakzent und „bleibt stehen", plus die Schwelle für die Sammelmeldung.

**`feature_toast_notifications` bleibt der Hauptschalter.** Diese Seite formt,
was gezeigt wird, sie entscheidet nicht *ob*. Zwei Stellen, an denen
Benachrichtigungen verschwinden können, sind eine zu viel zum Nachsehen — die
Maske sagt es deshalb ausdrücklich, wenn das Modul aus ist.

**Instanzweit und nicht pro Konto.** Ein Admin, der einen Servicedesk einrichtet,
entscheidet, wie laut der Raum ist; vierzig Leute, die die Einstellung einzeln
entdecken, sind vierzig Gelegenheiten, den Kanal abzuschalten, der eine
Ticketübergabe meldet. Was pro Person bleibt, ist das Theme — eine Eigenschaft
des Browsers, an dem jemand sitzt.

**`NotificationSettingsSchema` ist flach** (`reply_enabled`, `reply_tone`, …)
statt pro Kanal verschachtelt. Genau die Verschachtelung hat in diesem Projekt
zweimal zugeschlagen (`z.record`, siehe `PortalConfigSchema`); flache
Defaultwerte haben die Eigenschaft, auf die es ankommt: `parse({})` liefert ein
vollständiges Objekt, eine Teilzeile fällt Feld für Feld auf den Default zurück
statt ganz verworfen zu werden. Ein verworfener Parse würde einen stummgeschalteten
Kanal wieder laut machen — und ein System, das lauter ist als eingestellt, sieht
nach einem ganz anderen Fehler aus.

**Kanalfilterung passiert im Client, Sichtbarkeit im Server.** Der Watcher
entscheidet, was *eingeblendet* wird; welche Zeilen eine Sitzung überhaupt kennen
darf, entscheidet weiterhin allein `listNotifications`. Der Cursor rückt auch bei
einem stummen Kanal vor — sonst kämen dessen Ereignisse bei jeder Abfrage erneut,
solange sie im Rückblickfenster liegen.

### Sammelmeldung

Ab `digestThreshold` Ereignissen in einer Abfrage (Default 5) ersetzt **eine**
Meldung den Stapel: „Während deiner Abwesenheit: …". Sie bleibt stehen, bis sie
weggeklickt wird — sie hat einen Stapel ersetzt, fünf Sekunden für zwölf
Ereignisse wären derselbe Fehler noch einmal.

- **Gerechnet wird immer, das Modell schreibt nur um.** `deterministicDigest`
  (`lib/notification-digest.ts`, kein `server-only`, in `npm test` abgedeckt)
  liefert die vollständige Antwort; `services/ai/digest.ts` versucht eine bessere
  Formulierung und gibt bei **jedem** Fehlerpfad das Gezählte zurück — Feature
  aus, Anbieter nicht erreichbar, Antwort unpassend, Timeout. Es gibt keinen
  Zweig, in dem das Einschalten weniger liefert als vorher.
- **Die Ereignisse werden serverseitig neu abgeleitet**, nie aus dem Request
  übernommen. Text vom Browser zusammenfassen zu lassen wäre eine
  Prompt-Injection-Fläche und ein Weg, sich über fremde Tickets berichten zu
  lassen.
- **Eigener Endpunkt.** `GET /api/notifications` läuft alle zwanzig Sekunden und
  muss ein billiger indizierter Read bleiben; die Sammelmeldung darf auf ein
  Modell warten und läuft nur bei der seltenen Abfrage, die einen Rückstau findet.
- **Beispiele werden mit Zeilenumbruch verbunden, nicht mit `·`.** Die
  Pool-Benachrichtigung enthält selbst einen zwischen Nummer und Titel — drei
  Beispiele lasen sich als fünf. In `npm test` festgehalten.
- **Die Zahl kommt nie vom Modell.** Eine Überschrift, die „drei Antworten" über
  vier Ereignisse schreibt, kostet das ganze Feature seine Glaubwürdigkeit.

## KI-Assistenz: opt-in, sonst gar nicht

Vier Zusatzfunktionen, alle einzeln schaltbar unter `/admin/settings/ai`. Die Regel
darüber ist die eigentliche Architektur: **MITS ist ohne Modell ein vollständiges
Ticketsystem**, und keine dieser Funktionen stellt eine Anfrage, die nicht jemand
eingeschaltet hat.

| Schalter | Default | Braucht ein Modell? |
|---|---|---|
| `enabled` (Hauptschalter) | **an** | — |
| `clustering` | aus | nein, nur für die Überschrift |
| `summary` | aus | ja |
| `routing` | aus | ja |
| `deflection` | aus | nein |
| `digest` | aus | nein (formuliert nur um) |

**Der Hauptschalter ist an, die vier Funktionen sind aus.** Kein Widerspruch: der
Hauptschalter deckt auch die KI-Triage ab, die es vor dieser Seite schon gab, und
eine funktionierende Funktion beim Update still zu entfernen ist kein Opt-in
sondern eine Regression. Alles *Neue* ist aus.

**Zwei Funktionen laufen ohne Modell.** Das Gruppieren ähnlicher Tickets ist
Mengenarithmetik (`services/ai/similarity.ts`), die FAQ-Suche ist lexikalisch
(`services/ai/deflection.ts`). Beide sind rein und in `npm test` abgedeckt — das
ist der Grund, warum sie so gebaut sind: sie laufen bei jedem Queue-Render
beziehungsweise bei jeder Tippause, und ihre Fehler sind in beide Richtungen
still. Ein Modell schreibt beim Clustering nur die Überschrift und fällt bei
jedem Fehler auf die geteilten Wörter zurück; eine abgelaufene API-Schlüssel darf
keine Großstörung verschwinden lassen.

**Was Jaccard allein nicht kann.** Drei echte Meldungen derselben Störung
(„Outlook startet nicht mehr“ / „Outlook geht nicht“ / „Outlook lässt sich nicht
starten“) kommen auf 0,67 / 0,25 / 0,20 — bei Titeln aus zwei bis drei Tokens
kostet jedes ungeteilte Wort ein Drittel. Deshalb gilt zusätzlich: **ein geteiltes
Wort ab fünf Zeichen genügt.** Die Absicherung dagegen ist nicht die Schwelle,
sondern `clusterMinTickets`. **Paraphrasen ohne gemeinsames Wort werden nicht
erkannt** — „Outlook offline“ und „E-Mail geht nicht“ gruppieren nie. Das bräuchte
Embeddings, einen Vektorspeicher und einen Reindex-Job, und der driftet als
erstes von den Artikeln weg.

**Nichts passiert automatisch.** Das Banner ist ein Vorschlag mit zwei Knöpfen.
Eine Hauptstörung anzulegen setzt fremde Tickets auf „Wartet auf Hauptstörung“,
und das auf Wortüberschneidung hin falsch zu tun zahlen die Melder.

**`Ignorieren` merkt sich Tickets, nicht Gruppen.** Eine Gruppe hat keine
Identität — sie wächst. Auf die Gruppe geschlüsselt wäre die Ausblendung entweder
sofort hinfällig oder dauerhaft. Auf die Mitglieder geschlüsselt bleibt sie ruhig,
bis ein *neues* Ticket dazukommt, und genau dann ist sie wieder erwähnenswert.

**Der Provider ist eine Datei, kein SDK.** `services/ai/provider.ts` spricht
Ollama, OpenAI und Anthropic über `fetch`. Die drei offiziellen Clients wären
zweistellige Megabyte für einen POST pro Anbieter; der einzige echte Unterschied
ist die Structured-Output-Direktive — Ollamas `format`, OpenAIs `json_schema`,
Anthropics erzwungener Tool-Call. **Strukturierte Ausgabe ist Pflicht, nicht
Bitte:** ein Modell, das JSON frei schreibt, liefert oft genug Unparsebares,
dass der Fehler zum Normalzustand der Funktion wird. Deshalb sind in allen
Schemata alle Felder `required` und `additionalProperties: false` — OpenAIs
`strict` verlangt es, und ein Modell lässt sonst das Feld weg, das ihm am
schwersten fiel.

**Die Zusammenfassung wird nie gespeichert.** Sie ist im Moment der nächsten
Antwort veraltet, und eine veraltete Zusammenfassung ist schlimmer als keine: sie
ist selbstsicher falsch über den aktuellen Stand, und genau den liest jemand
darin nach.

**Verschlagwortung blockiert das Anlegen nicht.** `tagTicketInBackground` wird
bewusst nicht awaited und schluckt alles — anders als die Eingangsmail eine
Zeile darüber, deren Verlust Information kostet. Ein Melder wartet nicht auf ein
Modell, und ein Modell, das steht, macht aus einem Ticket keinen Fehler.

**Der Routing-Vorschlag ist ein Tag, keine Umsortierung.** `passt-eher:<id>`,
gegen den echten Katalog geprüft. Ein Modell, das Tickets still zwischen Queues
schiebt, schiebt manche falsch, und niemand weiß welche.

**`lib/services/ai/tags.ts` trägt kein `server-only`** — drei Aufrufer: der
Ticket-Kopf, `routing.ts` und die Offline-Suite. Gleiche Begründung wie bei
`lib/csv.ts`.

## KI-Pipeline (Phase 3)

Drei Ollama-Aufrufe, jeder einzeln eingegrenzt — `backend/main.py`:

1. **Transcribe** (nur mit Bild): Vision-Modell liest den Text aus den Screenshots.
   Das ist die OCR-Stufe; Tesseract ist bewusst nicht dabei (Dependency-Limit).
2. **Route**: Text-Modell wählt das Formular. `format` ist ein JSON-Schema, dessen
   `suggested_category_id` ein **Enum der angebotenen IDs** ist — das Modell kann
   keine ID erfinden.
3. **Extract**: Text-Modell füllt das Formular, `format` ist **das JSON-Schema des
   Formulars selbst**. `required` wird dabei entfernt: das Modell soll Felder leer
   lassen dürfen statt Werte zu erfinden. Die echte Pflichtfeldprüfung macht MITS
   beim Absenden.

### Konfiguration: UI-First, kein Backend-Config

Ollama-Adresse und beide Modellnamen stehen in `mits_setting` und werden unter
`/admin/settings/ai` gepflegt. **Umgebungsvariablen sind nur Fallback**, pro Feld:

```
UI-Einstellung  →  Umgebungsvariable  →  eingebauter Standard
```

Warum das Backend die DB nicht selbst liest: es läuft in einem eigenen Container und
hat keinen Zugriff auf die SQLite-Datei der Web-App. Das Gateway liest die Settings
**pro Anfrage** und schickt `ollama_base_url`, `text_model` und `vision_model` mit —
das Backend bleibt zustandslos und ohne eigene Konfiguration. Eine Änderung in der UI
greift damit ab der nächsten Anfrage, ohne Neustart.

Konsequenzen, die man kennen muss:

- `GET /api/v1/health` kennt die UI-Werte **nicht** und prüft die Env-Fallbacks. Die
  Felder heißen deshalb `fallback_*`. Die real benutzte Adresse prüft „Verbindung
  testen" in der Einstellungsmaske (`POST /api/v1/models`).
- Beide Werte kommen aus dem Request und werden im Backend validiert:
  `resolve_base_url` lässt nur `http`/`https` zu, `resolve_model` nur
  `[A-Za-z0-9._-/]` plus optionalen `:tag`. Ohne das wäre eine
  admin-gesetzte URL ein `file:`-Ziel für httpx.
- Dass ein Admin MITS auf jeden erreichbaren Host zeigen lassen kann, ist gewollt —
  aber deshalb ist `/admin/settings/ai` admin-only und `/api/admin/ai-models`
  ebenfalls.

Grenzen und Regeln:

- Der Browser ruft **nie** das Backend direkt. `/api/ai/triage` prüft die Session,
  hält den Service-Token und stellt die Schema-Liste zusammen — ein Client könnte
  dem Modell sonst eigene Schemata unterschieben.
- `mits-backend` veröffentlicht **keinen Port**. Zusätzlich verlangt es
  `X-MITS-Service-Token` und verweigert bei fehlender Konfiguration jeden Request
  (fail closed).
- KI-Ausgaben werden nie direkt übernommen: `pickSchemaFields` verwirft unbekannte
  Felder und Enum-Werte außerhalb des Schemas, danach befüllt das Ergebnis nur die
  **Startwerte** des echten Formulars. Abgesendet wird, was der Mensch bestätigt.
- Fehler werden benannt, nicht überspielt: nicht erreichbares Ollama, fehlendes
  Modell (`ollama pull …`) und Timeouts kommen als Klartext in den Chat.

## Auth-Modell

- **Rollen:** `user` < `technician` < `admin`. Vergleiche immer über `hasAtLeast`,
  nie über `===`. Unbekannte Rollenwerte fallen auf `user` zurück, nie nach oben.
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
  und nicht vom Browser. Ausgeliefert wird ausschließlich als Download
  (`Content-Disposition: attachment`, `nosniff`), damit ein hochgeladenes SVG oder
  HTML nicht im Origin der App läuft. `linkUploadsToTicket` prüft beim Anlegen des
  Tickets, dass **jede** referenzierte `fileId` dem Aufrufer gehört und noch an
  keinem anderen Ticket hängt — sonst könnte man die Datei einer Kollegin ins eigene
  Ticket hängen und später über das Board lesen. Ticket-Insert und Bindung laufen in
  **einer** Transaktion.
- **Portal-Links:** `isSafeResourceHref` lässt nur `http`, `https` und Pfade ab `/`
  zu — geprüft beim Speichern **und** beim Lesen, weil eine handeditierte Zeile sonst
  ein `javascript:`-Ziel in jede Portal-Seite bringen würde.

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
