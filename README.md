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

## Deployment mit Portainer (direkt aus der Repo-URL)

Portainer klont dieses Repository selbst und baut daraus beide Images. Es muss also
nichts lokal geklont, gebaut oder in eine Registry geschoben werden — die Repo-URL
genügt.

> **Wichtig: „Web editor" funktioniert hier nicht.** Der Stack baut aus dem
> Quellcode (`build:` mit `context: .`). Beim Web editor kennt Portainer nur die
> eingefügte Compose-Datei und hat keine `Dockerfile.web`, kein `backend/` und keine
> `package.json` — der Build bricht ab. Nimm **Repository**.

### Voraussetzungen

- Portainer mit Zugriff auf eine Docker-Umgebung.
- Der **Portainer-Server** (nicht dein Browser) muss `github.com` erreichen — er
  klont das Repo. Beim Build braucht der Docker-Host außerdem Internet für `npm ci`
  und `pip install`.
- Eine laufende Ollama-Instanz. Ollama ist **nicht** Teil des Stacks; MITS spricht sie
  über `OLLAMA_BASE_URL` an.
- Rund 2 GB Platz für die Build-Layer beider Images.

### 1. Modelle auf dem Ollama-Host laden

```bash
ollama pull llama3.1     # Routing und Feldextraktion
ollama pull llava        # Texterkennung in Screenshots
```

Ohne die Modelle läuft MITS trotzdem — die KI-Analyse meldet dann im Klartext,
welches Modell fehlt.

### 2. Zwei Geheimnisse erzeugen

```bash
openssl rand -hex 32     # -> BETTER_AUTH_SECRET
openssl rand -hex 32     # -> MITS_SERVICE_TOKEN
```

Beide getrennt erzeugen, nicht denselben Wert zweimal nehmen.

### 3. Stack anlegen

In Portainer: **Stacks** → **+ Add stack** → Name z. B. `mits` → Build method
**Repository**.

| Feld | Wert |
|---|---|
| Repository URL | `https://github.com/bohannjein/mits` |
| Repository reference | `refs/heads/main` |
| Compose path | `docker-compose.yml` |
| Authentication | nur bei privatem Repo einschalten (siehe unten) |
| Skip TLS verification | aus |

**Privates Repo:** *Authentication* aktivieren, als Username den GitHub-Namen und als
Password ein **Personal Access Token** mit `repo`-Leserecht eintragen. Portainer
speichert das Token; ein normales Passwort funktioniert bei GitHub nicht mehr.

**Automatische Updates (optional):** *GitOps updates* einschalten und entweder ein
Polling-Intervall (z. B. `5m`) setzen oder den Webhook kopieren und in GitHub unter
*Settings → Webhooks* eintragen. Dann deployt jeder Push auf `main` neu. Ohne das
bleibt der Stack stehen, bis du *Pull and redeploy* drückst.

### 4. Umgebungsvariablen eintragen

Unter *Environment variables* → **Advanced mode** einfügen und die Werte ersetzen:

```
BETTER_AUTH_SECRET=<hex-aus-schritt-2>
MITS_SERVICE_TOKEN=<hex-aus-schritt-2>
OLLAMA_BASE_URL=http://host.docker.internal:11434
BETTER_AUTH_URL=https://mits.firma.de
MITS_WEB_PORT=3000
```

Zu `OLLAMA_BASE_URL`:

| Wo läuft Ollama? | Wert |
|---|---|
| auf demselben Docker-Host | `http://host.docker.internal:11434` — der Name ist in der Compose-Datei per `extra_hosts` auf das Host-Gateway gemappt |
| auf einem anderen Server | `http://ollama.intern:11434` bzw. die IP |
| in einem anderen Compose-Stack | Container per gemeinsamem Docker-Netz erreichbar machen, dann `http://<container>:11434` |

`BETTER_AUTH_SECRET`, `MITS_SERVICE_TOKEN` und `OLLAMA_BASE_URL` sind in der
Compose-Datei als Pflicht deklariert. Fehlt einer, bricht das Deploy mit einer klaren
Meldung ab, statt halb zu starten.

### 5. Deploy the stack

Der erste Build dauert einige Minuten (Next-Build und beide Images) und legt das
Volume `mits-data` an. Danach:

```
http://<host>:3000/register
```

**Das erste angelegte Konto wird automatisch Administrator.** Danach im Admin-Desk
entscheiden, ob sich weitere Nutzer selbst registrieren dürfen — und aus welchen
E-Mail-Domains.

### 6. Kontrollieren

```bash
# Ollama erreichbar? Beide Modelle vorhanden?
docker exec mits-backend python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').read().decode())"

# Läuft das Web?
docker logs mits-web --tail 20
```

Die Health-Antwort nennt `ollama_reachable`, `text_model_present` und
`vision_model_present` — damit ist eine Fehlkonfiguration in einem Blick sichtbar.

### Updates

Im Stack **Pull and redeploy** (oder automatisch per GitOps, Schritt 3). Das Volume
`mits-data` bleibt: Nutzer, Sessions, Tickets, Anhänge, Portal-Inhalte und im Builder
gebaute Formulare überleben den Rebuild. Nur ein Löschen des Volumes verwirft sie.

### Was der Stack nach außen gibt

Nur `mits-web` auf `MITS_WEB_PORT`. Das KI-Backend hat bewusst **keinen**
veröffentlichten Port, ist nur im Docker-Netz erreichbar und verlangt zusätzlich den
Service-Token. Für HTTPS einen Reverse Proxy davorsetzen und `BETTER_AUTH_URL` auf die
öffentliche URL zeigen lassen — sonst leitet Better Auth den Origin aus dem Request ab
und Redirects landen auf dem falschen Host.

### Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| Deploy bricht sofort ab, „variable is not set" | Eine Pflichtvariable aus Schritt 4 fehlt. |
| Build scheitert bei `npm ci` oder `pip install` | Docker-Host kommt nicht ins Internet oder ein Proxy fehlt. |
| „failed to read dockerfile" | Build method war *Web editor* statt *Repository*. |
| Login klappt, aber man bleibt abgemeldet | `BETTER_AUTH_URL` zeigt nicht auf die tatsächlich aufgerufene URL, oder HTTPS terminiert davor ohne passende Header. |
| KI-Tab meldet „Ollama nicht erreichbar" | `OLLAMA_BASE_URL` aus Sicht des **Containers** prüfen, nicht vom eigenen Rechner aus. |
| Alle Sessions nach jedem Redeploy weg | `BETTER_AUTH_SECRET` war nicht gesetzt und wurde neu erzeugt. |

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
