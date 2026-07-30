# MITS — Modular IT Ticketing System

Leichtgewichtiges, KI-first IT-Service-Portal. Meldungen kommen über **drei Wege** herein und
landen immer als dieselbe strukturierte Payload im System:

| Modus | Beschreibung |
|---|---|
| **Legacy** | Klassisch: Titel + Freitext. Für alles, was in kein Schema passt. |
| **Guided Wizard** | Schema-driven, Kategorie zuerst — nur relevante Felder, kein Freitext-Zwang. |
| **Smart KI-Chat** | Freitext oder Screenshot per Drag & Drop; Ollama übersetzt beides in einen Formularvorschlag, den du prüfst und absendest. |

Ticket-Typen sind **Daten, nicht Code**: jeder Typ ist ein JSON-Schema (`MITSFormSchema`), aus
dem das Formular dynamisch gerendert wird — im Admin-Desk auch klickbar über den
Formular-Builder mit Live-Vorschau.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, Lucide
- **Forms:** react-hook-form + zod, eigener JSON-Schema-Renderer
- **State:** TanStack Query (Server-State), Zustand (UI-State)
- **Auth:** Better Auth (E-Mail/Passwort) mit den Rollen `user`, `technician`, `admin`
- **Persistenz:** SQLite + Datei-Ablage auf Platte — beides im Datenverzeichnis, kein externer Dienst
- **KI-Backend:** FastAPI (Python), spricht eine bestehende Ollama-Instanz an

## Portal

Die Startseite ist das Portal für Endnutzer:

- **Systemmeldungen** als Banner (`info`, `warning`, `critical`) — gepflegt unter
  `/admin/portal`, sichtbar auch über dem Ticket-Eingang. Eine Meldung lässt sich
  ausschalten, ohne sie zu löschen.
- **Schnellzugriffe** als Kacheln: TeamViewer QuickSupport, WLAN-Zertifikat,
  VPN-Anleitung — Label, Beschreibung, Icon und Ziel frei konfigurierbar.
  Zugelassen sind nur `http`, `https` und Pfade ab `/`; alles andere wird
  abgelehnt, damit eine Kachel kein `javascript:`-Ziel tragen kann.

## Rollen

| Rolle | Darf |
|---|---|
| `user` | Tickets erfassen und **nur die eigenen** sehen, inklusive eigener Anhänge |
| `technician` | zusätzlich das Ticket-Board mit allen Meldungen und deren Anhängen |
| `admin` | zusätzlich den Admin-Desk: Registrierungspolicy, Rollen, Portal-Inhalte, Formular-Builder |

Das **erste** Konto einer Instanz wird immer angelegt und erhält automatisch `admin`.
Danach steuert der Admin-Desk, ob sich weitere Nutzer selbst registrieren dürfen und
aus welchen E-Mail-Domains.

## Anhänge

Dateien liegen unter `<Datenverzeichnis>/uploads`, im Container also im Volume
`mits-data`. Der Browser erfährt nie einen Pfad, sondern eine ID; jeder Download
läuft über `/api/uploads/<id>` und wird pro Anfrage geprüft.

| Grenze | Wert |
|---|---|
| Größe pro Datei | 10 MB |
| Dateien pro Upload | 5 |
| Erlaubte Endungen | `png` `jpg` `jpeg` `gif` `webp` `bmp` `pdf` `txt` `log` `csv` `zip` `eml` `msg` `docx` `xlsx` |

Alles wird als Download ausgeliefert (`Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`) — ein hochgeladenes SVG oder HTML soll nicht im
Origin der App ausgeführt werden.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:3000 — /register anlegen, wird Admin
npm run build        # Prod-Build
npm run typecheck    # Typprüfung
npm test             # Checks für den Schema-Compiler
```

KI-Backend lokal, ohne Docker:

```bash
python -m venv .venv && .venv/Scripts/pip install -r backend/requirements.txt
OLLAMA_BASE_URL=http://localhost:11434 MITS_SERVICE_TOKEN=dev \
  .venv/Scripts/python -m uvicorn main:app --app-dir backend --port 8000
```

Die Next-App braucht dann `MITS_BACKEND_URL=http://localhost:8000` und denselben
`MITS_SERVICE_TOKEN`.

## Umgebungsvariablen

Vollständige Vorlage mit Kommentaren: [.env.example](.env.example).

| Variable | Pflicht | Gilt für | Standard | Bedeutung |
|---|---|---|---|---|
| `BETTER_AUTH_SECRET` | **ja** (Docker) | web | generiert | HMAC-Schlüssel für Session-Cookies. `openssl rand -hex 32`. Außerhalb von Docker optional: MITS legt sonst einen Schlüssel unter `<Datenverzeichnis>/auth-secret` ab. Im Stack Pflicht, weil er sonst bei jedem Rebuild neu wäre und alle Sessions verfielen. |
| `MITS_SERVICE_TOKEN` | **ja** | web + backend | — | Gemeinsames Geheimnis. Das Backend weist jede Anfrage ohne diesen Header ab und verweigert bei fehlender Konfiguration alles (fail closed). Beide Services brauchen denselben Wert. |
| `OLLAMA_BASE_URL` | **ja** | backend | — | Adresse der bestehenden Ollama-Instanz, z. B. `http://host.docker.internal:11434` für Ollama auf dem Docker-Host. |
| `BETTER_AUTH_URL` | empfohlen | web | aus Request | Öffentliche URL, z. B. `https://mits.firma.de`. Ohne den Wert leitet Better Auth den Origin aus dem Request ab — hinter einem Proxy, der `Host` umschreibt, falsch. |
| `MITS_TRUSTED_ORIGINS` | nein | web | leer | Weitere erlaubte Origins für die Auth-Endpoints, kommagetrennt. |
| `MITS_WEB_PORT` | nein | compose | `3000` | Host-Port, auf dem `mits-web` veröffentlicht wird. |
| `MITS_DATA_DIR` | nein | web | `./data` bzw. `/app/data` | Wohin `mits.db`, `uploads/` und `auth-secret` schreiben. Im Container das gemountete Volume. |
| `MITS_BACKEND_URL` | nein | web | `http://localhost:8000` | Adresse des KI-Backends. Im Stack von Compose gesetzt (`http://mits-backend:8000`); nur für lokale Entwicklung nötig. |
| `OLLAMA_TEXT_MODEL` | nein | backend | `llama3.1` | Modell für Routing und Feldextraktion. |
| `OLLAMA_VISION_MODEL` | nein | backend | `llava` | Modell für die Texterkennung in Screenshots. |
| `OLLAMA_TIMEOUT_SECONDS` | nein | backend | `120` | Zeitlimit pro Ollama-Aufruf. Bei CPU-Inferenz eher erhöhen als senken. |

## Deployment (Portainer)

Ollama ist **nicht** Teil des Stacks — MITS spricht eine bestehende Instanz über
`OLLAMA_BASE_URL` an.

**1. Modelle auf dem Ollama-Host laden**

```bash
ollama pull llama3.1     # Routing und Feldextraktion
ollama pull llava        # Texterkennung in Screenshots
```

**2. Zwei Geheimnisse erzeugen**

```bash
openssl rand -hex 32     # -> BETTER_AUTH_SECRET
openssl rand -hex 32     # -> MITS_SERVICE_TOKEN
```

**3. Stack in Portainer anlegen**

*Stacks* → *Add stack* → Name z. B. `mits` → Build method **Repository**:

| Feld | Wert |
|---|---|
| Repository URL | `https://github.com/bohannjein/mits` |
| Repository reference | `refs/heads/main` |
| Compose path | `docker-compose.yml` |

**4. Umgebungsvariablen eintragen**

Unter *Environment variables* → *Advanced mode* einfügen und die Werte ersetzen:

```
BETTER_AUTH_SECRET=<hex-aus-schritt-2>
MITS_SERVICE_TOKEN=<hex-aus-schritt-2>
OLLAMA_BASE_URL=http://host.docker.internal:11434
BETTER_AUTH_URL=https://mits.firma.de
MITS_WEB_PORT=3000
```

`BETTER_AUTH_SECRET`, `MITS_SERVICE_TOKEN` und `OLLAMA_BASE_URL` sind in der
Compose-Datei als Pflicht deklariert — fehlt einer, bricht das Deploy mit einer
klaren Meldung ab, statt halb zu starten.

**5. Deploy the stack**

Beim ersten Start baut Portainer beide Images (ein paar Minuten) und legt das Volume
`mits-data` an. Danach `http://<host>:3000/register` aufrufen — **das erste Konto wird
automatisch Administrator.**

**6. Kontrollieren**

```bash
# Ollama erreichbar? Modelle vorhanden?
docker exec mits-backend python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').read().decode())"

# Läuft das Web?
docker logs mits-web --tail 20
```

**Updates:** Im Stack *Pull and redeploy*. Das Volume `mits-data` bleibt — Nutzer,
Sessions, Tickets, Anhänge, Portal-Inhalte und gebaute Formulare überleben den
Rebuild.

**Was der Stack nach außen gibt:** nur `mits-web`. Das KI-Backend hat bewusst keinen
veröffentlichten Port und ist nur im Docker-Netz erreichbar; zusätzlich verlangt es
den Service-Token.

## Roadmap

1. **Setup & UI** — Branding, Stack, Design-System, Typ-Fundament ✅
2. **Schema Forms** — Dynamic Form Engine, Legacy-Modus + Guided Wizard ✅
   – dazu Auth, RBAC und Ticket-Persistenz ✅
3. **KI & OCR Engine** — FastAPI, Ollama-Triage, Feldextraktion, Dockerization ✅
4. **Portal & Admin** — Störungs-Banner, Schnellzugriffe, Datei-Upload,
   Formular-Builder mit Live-Vorschau ✅

Offen für später: Board-Workflow (Zuweisung, Statuswechsel, Kommentare) und echtes
OCR für gescannte Dokumente per Tesseract.

Konventionen und verbindliche Regeln: [AGENTS.md](AGENTS.md).

## Repository

Remote: https://github.com/bohannjein/mits (Branch `main`)
