# MITS — Modular IT Ticketing System

Leichtgewichtiges, KI-first IT-Service-Portal. Meldungen kommen über **drei Wege** herein und
landen immer als dieselbe strukturierte Payload im System:

| Modus | Beschreibung |
|---|---|
| **Legacy** | Klassisch: Titel + Freitext. Für alles, was in kein Schema passt. |
| **Guided Wizard** | Schema-driven, Kategorie zuerst — nur relevante Felder, kein Freitext-Zwang. |
| **Smart KI-Chat** | Freitext oder Screenshot; Ollama übersetzt beides in eine Formular-Payload. |

Ticket-Typen sind **Daten, nicht Code**: jeder Typ ist ein JSON-Schema (`MITSFormSchema`), aus
dem das Formular dynamisch gerendert wird.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, Lucide
- **Forms:** react-hook-form + zod, eigener JSON-Schema-Renderer
- **State:** TanStack Query (Server-State), Zustand (UI-State)
- **Backend:** FastAPI (Python) für KI-Routing und Ollama-Integration — ab Phase 3

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # Prod-Build
npx tsc --noEmit     # Typprüfung
```

## Roadmap

1. **Setup & UI** — Branding, Stack, Design-System, Typ-Fundament ✅
2. **Schema Forms** — Dynamic Form Engine, Legacy-Modus + Guided Wizard
3. **KI & OCR Engine** — FastAPI, Ollama-Triage, Feldextraktion aus Text und Scans
4. **Portal & Admin** — Störungs-Banner, Ticket-Board, Verwaltung

Konventionen und verbindliche Regeln: [AGENTS.md](AGENTS.md).

## Repository

Remote: https://github.com/bohannjein/mits (Branch `main`)
