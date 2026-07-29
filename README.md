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
- **Auth:** Better Auth (E-Mail/Passwort) mit den Rollen `user`, `technician`, `admin`
- **Persistenz:** SQLite — eine Datei im Datenverzeichnis, kein externer Dienst nötig
- **Backend:** FastAPI (Python) für KI-Routing und Ollama-Integration — ab Phase 3

## Rollen

| Rolle | Darf |
|---|---|
| `user` | Tickets erfassen und **nur die eigenen** sehen |
| `technician` | zusätzlich das Ticket-Board mit allen Meldungen |
| `admin` | zusätzlich den Admin-Desk: Registrierungspolicy und Rollen |

Das **erste** Konto einer Instanz wird immer angelegt und erhält automatisch `admin`.
Danach steuert der Admin-Desk, ob sich weitere Nutzer selbst registrieren dürfen und
aus welchen E-Mail-Domains.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:3000 — /register anlegen, wird Admin
npm run build        # Prod-Build
npm run typecheck    # Typprüfung
npm test             # Checks für den Schema-Compiler
```

Konfiguration: [.env.example](.env.example). Ohne `BETTER_AUTH_SECRET` erzeugt MITS
beim ersten Start einen Schlüssel und legt ihn im Datenverzeichnis ab.

## Roadmap

1. **Setup & UI** — Branding, Stack, Design-System, Typ-Fundament ✅
2. **Schema Forms** — Dynamic Form Engine, Legacy-Modus + Guided Wizard ✅
   – dazu Auth, RBAC und Ticket-Persistenz ✅
3. **KI & OCR Engine** — FastAPI, Ollama-Triage, Feldextraktion aus Text und Scans
4. **Portal & Admin** — Störungs-Banner, Board-Workflow (Zuweisung, Statuswechsel)

Konventionen und verbindliche Regeln: [AGENTS.md](AGENTS.md).

## Repository

Remote: https://github.com/bohannjein/mits (Branch `main`)
