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

## Stack

| Ebene | Wahl |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, `src/`-Layout, Alias `@/*` |
| Styling | Tailwind v4 (CSS-Variablen, keine `tailwind.config.ts`) + shadcn/ui + Lucide |
| Forms | `react-hook-form` + `zod`, eigener JSON-Schema-Renderer (Phase 2) |
| State | TanStack Query (Server-State) · Zustand (UI-State) |
| Backend | FastAPI in `backend/` für KI-Routing und Ollama (ab Phase 3) |

`@shadcn/form` ist in der Registry vorhanden, aber ein leerer Stub (nur `name` + `type`,
keine `files`) — `shadcn add` legt daher nichts an. Ersatz liegt in
`src/components/forms/form.tsx`: `Form`, `FormField`, `FormItem`, `FormLabel`,
`FormControl`, `FormDescription`, `FormMessage` mit der kanonischen shadcn-API. Diese Datei
ist **unser** Code, nicht CLI-verwaltet — deshalb bewusst nicht in `components/ui/`.

## Struktur

```
src/
  app/
    globals.css            alle Design-Tokens
    page.tsx               Startseite
    tickets/new/page.tsx   Ticket-Eingang (Tri-Modal)
  components/
    branding/              ThemeProvider, MITSLogo
    providers/             QueryProvider
    forms/
      form.tsx             RHF-Primitives (Ersatz für @shadcn/form)
      schema-form.tsx      <SchemaForm> — die einzige Formular-Komponente
    tickets/
      tri-modal-container.tsx   Tabs: Legacy | Katalog | KI
      service-catalog.tsx       Kategorie-Kacheln → SchemaForm
      ai-chat.tsx               Freitext + Screenshot-Upload
      draft-receipt.tsx         validierter Entwurf als JSON
    ui/                    shadcn-Primitives — nur per CLI ändern/ergänzen
  lib/
    forms/schema-to-zod.ts  JSON Schema → zod + Feldauflösung
    forms/registry.tsx      Widget → shadcn-Control
    ai/extract.ts           Naht für Phase 3 (liefert bis dahin "unavailable")
    store/intake-store.ts   Zustand: aktiver Modus, gewähltes Schema
    mock-schemas.ts         Beispiel-Schemata (Backend-Ersatz)
    icons.ts                erlaubte Lucide-Icons für schema.icon
    utils.ts                cn()
  types/mits.ts            MITSTicket (zod) + MITSFormSchema (JSON Schema)
scripts/verify-forms.mts   Checks für den Schema-Compiler (`npm test`)
```

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
| 3 | KI & OCR (FastAPI, Ollama, Triage, Feldextraktion) — Naht: `lib/ai/extract.ts` | offen |
| 4 | Portal & Admin (Störungs-Banner, Ticket-Board) | offen |

Noch keine Persistenz: `SchemaForm` gibt den validierten `MITSTicketDraft` an den Aufrufer,
der ihn im Zustand-Store ablegt und als `DraftReceipt` anzeigt. Backend-POST kommt mit Phase 3.

## Workflow

Nach jeder abgeschlossenen Phase committen und pushen:

```bash
git add -A
git commit -m "..."
git push origin main   # https://github.com/bohannjein/mits
```

## Verifikation

```bash
npx tsc --noEmit     # Typen
npm run build        # Prod-Build
npm run dev          # http://localhost:3000
```

Regel-2-Check — muss leer bleiben:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(" src --include=*.tsx --include=*.ts
```
