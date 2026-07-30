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
| Forms | `react-hook-form` + `zod`, eigener JSON-Schema-Renderer (Phase 2) |
| State | TanStack Query (Server-State) · Zustand (UI-State) |
| Auth | Better Auth 1.6 (E-Mail/Passwort), Rollen `user` < `technician` < `admin` |
| Persistenz | SQLite (`better-sqlite3`, WAL) in `<data dir>/mits.db` |
| KI-Backend | FastAPI in `backend/` — nur `fastapi`, `uvicorn`, `httpx`, `pydantic` |
| LLM | bestehende Ollama-Instanz per `OLLAMA_BASE_URL` (nicht Teil des Stacks) |
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
  app/
    globals.css            alle Design-Tokens
    page.tsx               Startseite
    (auth)/login|register  Anmeldung / Registrierung
    forbidden/             Landung für angemeldet-aber-zu-wenig-Rechte
    tickets/page.tsx       eigene Tickets
    tickets/new/page.tsx   Ticket-Eingang (Tri-Modal)
    board/page.tsx         alle Tickets (technician + admin)
    admin/page.tsx         Registrierungspolicy + Rollen (admin)
    admin/actions.ts       Server Actions, prüfen die Rolle selbst
    api/auth/[...all]/     Better-Auth-Endpoints
    api/tickets/           Ticket-API (Scope aus der Rolle)
    api/ai/triage/         Session-geprüftes Gateway zum FastAPI-Backend
  components/
    branding/              ThemeProvider, MITSLogo
    layout/app-header.tsx  Header (Server Component) mit UserMenu
    providers/             QueryProvider
    auth/                  login-form, register-form, user-menu
    admin/                 registration-settings-form, user-role-form
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
    auth/server.ts          betterAuth-Konfiguration + Schema-Bootstrap
    auth/session.ts         requireUser / requireRole / getSessionUserFor
    auth/client.ts          Browser-Client (signIn/signUp/signOut)
    db/sqlite.ts            Verbindung + MITS-Tabellen
    settings.ts             Registrierungspolicy (mits_setting)
    users.ts                Benutzerliste + Rollenwechsel
    tickets.ts              Persistenz + Zugriffsregeln
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

Schema zu `CATALOG_SCHEMAS` in `src/lib/mock-schemas.ts` hinzufügen — fertig. Kacheln,
Formular, Validierung und Payload entstehen daraus. Labels für Enum-Werte stehen in
`uiHints.optionLabels`, damit `schema` reines JSON Schema bleibt (kein `enumNames`).
Ein neues Widget braucht einen Eintrag in `MITSFieldWidget` **und** in `FIELD_REGISTRY`.

## Design-System

Industrial / Neobrutalism, **Dark ist Standard** (`ThemeProvider`: `defaultTheme="dark"`,
`enableSystem={false}`). Merkmale: `--radius: 0.25rem` (kantig), opake kontraststarke Border,
Industrie-Amber als `--primary`, harte Offset-Schatten (`shadow-brutal`, `shadow-brutal-primary`)
und die Utilities `bg-grid` (Blueprint-Raster) und `label-industrial` (Mono-Kapitälchen-Label).
Alle leiten sich aus Tokens ab und folgen dem Theme automatisch.

## Roadmap

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Setup, Design-System, Typ-Fundament | ✅ |
| 2 | Form Engine (`schema-to-zod`, `SchemaForm`, Registry) + Tri-Modal-Eingang | ✅ |
| — | Auth & RBAC (Better Auth, Rollen, Registrierungspolicy, Ticket-Persistenz) | ✅ |
| 3 | KI-Routing, Vision-OCR, Dockerization für Portainer | ✅ |
| 4 | Portal & Admin (Störungs-Banner, Board-Workflow, Datei-Upload/Blob-Storage) | offen |

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
- **Ticket-Sichtbarkeit:** `listTicketsFor` entscheidet nach Rolle. `user` sieht nur
  eigene Tickets; `getTicketFor` antwortet bei fremdem Ticket mit `null` statt 403,
  damit sich keine IDs über den Statusunterschied ermitteln lassen.
- **Payload:** Die API validiert erneut gegen das Formularschema (`strictObject`),
  auch wenn der Browser das schon getan hat. Anhänge sind in dieser Phase nur
  Metadaten (`name`, `size`, `type`) — Blob-Storage fehlt noch.

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
lehnt zustandsändernde Requests ohne vertrauenswürdigen `Origin`-Header mit
`403 Missing or null Origin` ab. Das ist der CSRF-Schutz, kein Fehler.

Regel-2-Check — muss leer bleiben:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(" src --include=*.tsx --include=*.ts
```
