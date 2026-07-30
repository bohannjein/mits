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

Diese drei Regeln haben Vorrang vor Bequemlichkeit. Kein Code, der sie bricht.

1. **Keine eigenen UI-Primitives.** Buttons, Modals, Inputs, Cards, Badges usw. kommen
   ausschließlich aus `src/components/ui/` (shadcn/ui, Style `radix-nova`). Neue Primitives
   per `npx shadcn@latest add <name>` holen, nicht handschreiben. Anpassen ist erlaubt —
   über `className` auf dem shadcn-Primitive, nicht durch einen Nachbau.
2. **Keine hartkodierten Farben.** Nur semantische Klassen: `bg-background`, `text-foreground`,
   `border-border`, `bg-primary`, `text-muted-foreground`, `bg-destructive`, … Kein Hex, kein
   `rgb()`, kein `oklch()` und keine Tailwind-Palette (`bg-zinc-800`) außerhalb von
   `src/app/globals.css`. Neue Farbe = neues Token in `globals.css` (`:root` **und** `.dark`).
3. **Schema-First.** Es gibt keine Komponente pro Ticket-Typ (kein `Onboarding.tsx`). Ein
   Ticket-Typ ist ein `MITSFormSchema` (JSON Schema + `uiHints`); Formulare werden daraus
   dynamisch gerendert.
4. **`src/proxy.ts` ist keine Sicherheitsgrenze.** Die Next-Docs sind da eindeutig: eine
   Matcher-Änderung oder eine verschobene Server Function entfernt die Proxy-Abdeckung
   lautlos. Der Proxy ist nur der schnelle Weg (Redirect vor dem Rendern). **Jede**
   geschützte Seite ruft `requireUser`/`requireRole`, **jede** Route Handler und **jede**
   Server Action prüft die Session selbst — siehe `lib/auth/session.ts`.
5. **Niemals Eigentümerschaft aus dem Request lesen.** `created_by` kommt aus der Session.
   `MITSTicketDraftSchema` lässt das Feld bewusst weg, statt es optional zu machen.

## Stack

| Ebene | Wahl |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, `src/`-Layout, Alias `@/*` |
| Styling | Tailwind v4 (CSS-Variablen, keine `tailwind.config.ts`) + shadcn/ui + Lucide |
| Motion | `framer-motion` — Spring-Physics, kein `duration`-Easing |
| Forms | `react-hook-form` + `zod`, eigener JSON-Schema-Renderer (Phase 2) |
| State | TanStack Query (Server-State) · Zustand (UI-State) |
| Auth | Better Auth 1.6 (E-Mail/Passwort), Rollen `user` < `technician` < `admin` |
| Persistenz | SQLite (`better-sqlite3`, WAL) in `<data dir>/mits.db` |
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
    branding/              ThemeProvider, MITSLogo
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
      tri-modal-container.tsx   Tabs: Legacy | Katalog | KI, POST /api/tickets
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

**Google Web Design Language** (Material 3 / Gemini), **Dark ist Standard**
(`ThemeProvider`: `defaultTheme="dark"`, `enableSystem={false}`).

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

**Der Helpdesk-Ausbau läuft in fünf Parts. Part 1 ist fertig (`0f68a17`), als nächstes
kommt Part 2 (E-Mail & SMTP).** Der vollständige Plan mit Dateien, Entscheidungen und
Stolperfallen steht in **[ROADMAP.md](ROADMAP.md)** — vor dem Weiterarbeiten dort lesen,
nicht neu herleiten.

| Part | Inhalt | Status |
|---|---|---|
| 1 | Ticket-Nummern, Standorte, Agenten-Workflow, Feature-Toggles, JSON-Cleanup | ✅ `0f68a17` |
| 2 | E-Mail & SMTP (`nodemailer`, `/admin/settings/email`) | ⬜ **nächster** |
| 3 | Suche & Deep-Filter | ⬜ |
| 4 | Agenten-Dashboard & Techniker-Präsenz | ⬜ |
| 5 | Formular-Builder (Canvas, bedingte Logik, abhängige Dropdowns) | ⬜ |

Die Server-Funktionen für Part 3 und 4 sind bereits geschrieben und typgeprüft
(`getTicketByNumberFor`, `listUnassignedTickets`, `listAssignedTickets`, `todayCounts`,
`ticketCountsByLocation`, `parseTicketNumber`) — dort ansetzen, nicht neu bauen.

Weiter offen und **nicht** Teil der fünf Parts: echtes OCR für gescannte Dokumente per
Tesseract — bräuchte `pytesseract` plus `tesseract-ocr-deu` im Backend-Image und sprengt
damit das Vier-Pakete-Limit.

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

Regel-2-Check — muss leer bleiben:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(" src --include=*.tsx --include=*.ts
```
