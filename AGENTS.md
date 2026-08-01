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

**Google Web Design Language** (Material 3 / Gemini), **Dark ist Standard, Light
gleichwertig** (`ThemeProvider`: `defaultTheme="dark"`, `enableSystem`).

`defaultTheme` und `enableSystem` widersprechen sich nicht: der Default gilt für ein
Konto ohne gespeicherte Wahl — dark, passend zum `class="dark"`, das der Server ins
`<html>` schreibt, also ohne Flash beim ersten Besuch. `enableSystem` fügt nur
*„System“* als wählbare Option hinzu. Umgeschaltet wird über `ThemeToggle` im Header
und unter „Erscheinungsbild“ in `/settings/profile`; gespeichert wird in
`localStorage`, nicht in `mits_setting` — das ist eine Eigenschaft dieses Browsers,
nicht der Person.

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
| `--bubble-customer*` | Kunden-Bubble, neutrale Fläche |
| `--bubble-agent*` | Agenten-Bubble, blauer Akzent, plus `-accent` für das Rollen-Label |
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

**Die Bubble-Seiten hängen am Sprecher, nicht am Betrachter.** Melder links, Team
rechts, in beiden Ansichten. Die naheliegende Spiegelung („eigene Nachrichten
rechts", wie ein Handy-Messenger) war gebaut und ist wieder raus: derselbe Verlauf
hätte zwei Layouts, ein Screenshot vom Melder und einer vom Agenten liegen nicht
übereinander, und „die Nachricht links" in einer Übergabe wäre keine Ortsangabe
mehr. `ChatBubble` nimmt `side` trotzdem als Prop — die geteilte Komponente soll
keine Perspektive einbetoniert haben.

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
/mits/cmdb/…            Bestand, Lizenzen, Objekt-Detailansicht (Agenten)
/mits/analytics         Statistiken (Agenten), Anwender gesperrt
/admin/…                Administration
/admin/macros           Makros
/admin/settings/storage Dateispeicher (Platte oder S3)
/admin/settings/analytics Widget-Schalter und Default-Intervall
/admin/mail             Postfach-Abruf + Defender-Regel
/api/notifications      Feed für die Einblendungen, `?since=` (jede Rolle)
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
npm test             # Schema-Compiler (offline)
npm run dev          # http://localhost:3000
```

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
