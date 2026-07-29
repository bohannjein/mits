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

`shadcn add form` existiert in der `radix-nova`-Registry nicht — die Feld-Wrapper
(`FormField`/`FormMessage`-Äquivalent) baut Phase 2 selbst auf `react-hook-form`.

## Struktur

```
src/
  app/                     App Router, globals.css (alle Design-Tokens)
  components/
    branding/              ThemeProvider, MITSLogo
    providers/             QueryProvider
    ui/                    shadcn-Primitives — nur per CLI ändern/ergänzen
  lib/                     utils (cn), später schema-to-zod
  types/mits.ts            MITSTicket (zod) + MITSFormSchema (JSON Schema)
```

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
| 2 | Dynamic Form Engine (`schema-to-zod`, `SchemaForm`, Legacy + Wizard) | offen |
| 3 | KI & OCR (FastAPI, Ollama, Triage, Feldextraktion) | offen |
| 4 | Portal & Admin (Störungs-Banner, Ticket-Board) | offen |

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
