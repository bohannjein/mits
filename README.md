# MITS — Modular IT Ticketing System

Leichtgewichtiges, KI-first IT-Service-Portal. Meldungen kommen über **drei Wege** herein und
landen immer als dieselbe strukturierte Payload im System:

| Modus | Beschreibung |
|---|---|
| **Legacy** | Klassisch: Titel + Freitext. Für alles, was in kein Schema passt. |
| **Guided Wizard** | Schema-driven, Kategorie zuerst — nur relevante Felder, kein Freitext-Zwang. |
| **Smart KI-Chat** | Freitext oder Screenshot per Drag & Drop; Ollama übersetzt beides in einen Formularvorschlag, den du prüfst und absendest. |

Ticket-Typen sind **Daten, nicht Code**: jeder Typ ist ein JSON-Schema (`MITSFormSchema`), aus
dem das Formular dynamisch gerendert wird.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, Lucide
- **Forms:** react-hook-form + zod, eigener JSON-Schema-Renderer
- **State:** TanStack Query (Server-State), Zustand (UI-State)
- **Auth:** Better Auth (E-Mail/Passwort) mit den Rollen `user`, `technician`, `admin`
- **Persistenz:** SQLite — eine Datei im Datenverzeichnis, kein externer Dienst nötig
- **KI-Backend:** FastAPI (Python), spricht eine bestehende Ollama-Instanz an

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

## Deployment (Portainer)

Ollama ist **nicht** Teil des Stacks — MITS spricht eine bestehende Instanz über
`OLLAMA_BASE_URL` an. Läuft Ollama auf dem Docker-Host, funktioniert
`http://host.docker.internal:11434`.

1. Auf dem Ollama-Host die Modelle laden:
   ```bash
   ollama pull llama3.1     # Routing und Feldextraktion
   ollama pull llava        # Texterkennung in Screenshots
   ```
2. In Portainer einen Stack anlegen — **Repository** → `https://github.com/bohannjein/mits`,
   Compose-Pfad `docker-compose.yml`.
3. Diese Umgebungsvariablen setzen (Vorlage: [.env.example](.env.example)):

   | Variable | Pflicht | Bedeutung |
   |---|---|---|
   | `BETTER_AUTH_SECRET` | ja | signiert Session-Cookies (`openssl rand -hex 32`) |
   | `MITS_SERVICE_TOKEN` | ja | gemeinsames Geheimnis zwischen Web und Backend |
   | `OLLAMA_BASE_URL` | ja | z. B. `http://host.docker.internal:11434` |
   | `BETTER_AUTH_URL` | empfohlen | öffentliche URL, z. B. `https://mits.firma.de` |
   | `MITS_WEB_PORT` | nein | Host-Port, Standard `3000` |
   | `OLLAMA_TEXT_MODEL` / `OLLAMA_VISION_MODEL` | nein | Standard `llama3.1` / `llava` |

4. Deployen. Der erste Aufruf von `/register` erzeugt das Admin-Konto.

Der Stack veröffentlicht nur `mits-web`. Das KI-Backend ist ausschließlich im
Docker-Netz erreichbar und verlangt zusätzlich den Service-Token. Nutzer, Sessions,
Tickets und Einstellungen liegen im Volume `mits-data` und überleben ein Rebuild.

Läuft es? `docker exec mits-backend python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').read().decode())"`
zeigt, ob Ollama erreichbar ist und ob beide Modelle vorhanden sind.

## Roadmap

1. **Setup & UI** — Branding, Stack, Design-System, Typ-Fundament ✅
2. **Schema Forms** — Dynamic Form Engine, Legacy-Modus + Guided Wizard ✅
   – dazu Auth, RBAC und Ticket-Persistenz ✅
3. **KI & OCR Engine** — FastAPI, Ollama-Triage, Feldextraktion, Dockerization ✅
4. **Portal & Admin** — Störungs-Banner, Board-Workflow (Zuweisung, Statuswechsel),
   Datei-Upload mit Blob-Storage

Konventionen und verbindliche Regeln: [AGENTS.md](AGENTS.md).

## Repository

Remote: https://github.com/bohannjein/mits (Branch `main`)
