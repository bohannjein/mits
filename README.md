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
**Keine Variable ist Pflicht.** Der Stack deployt mit leerem Environment: beide
Geheimnisse werden beim ersten Start erzeugt, alles zur KI wird in der UI gepflegt.

| Variable | Pflicht | Gilt für | Standard | Bedeutung |
|---|---|---|---|---|
| `BETTER_AUTH_SECRET` | nein | web | **erzeugt** | HMAC-Schlüssel für Session-Cookies. Ohne Angabe erzeugt MITS einen und legt ihn unter `<Datenverzeichnis>/auth-secret` ab — er überlebt Neustarts und Redeploys. Selbst setzen (`openssl rand -hex 32`) nur, wenn mehrere Instanzen Sessions teilen sollen oder das Datenverzeichnis nicht persistent ist. |
| `MITS_SERVICE_TOKEN` | nein | web + backend | **erzeugt** | Gemeinsames Geheimnis. Ohne Angabe erzeugt die Web-App es unter `<Datenverzeichnis>/service-token`; das Backend mountet dasselbe Volume read-only und liest es dort. Nur nötig, wenn beide Dienste kein Volume teilen. |
| `BETTER_AUTH_URL` | empfohlen | web | aus Request | Öffentliche URL, z. B. `https://mits.firma.de`. Ohne den Wert leitet Better Auth den Origin aus dem Request ab — hinter einem Proxy, der `Host` umschreibt, falsch. |
| `MITS_TRUSTED_ORIGINS` | nein | web | leer | Weitere erlaubte Origins für die Auth-Endpoints, kommagetrennt. |
| `MITS_WEB_PORT` | nein | compose | `3000` | Host-Port, auf dem `mits-web` veröffentlicht wird. |
| `MITS_DATA_DIR` | nein | web | `./data` bzw. `/app/data` | Wohin `mits.db`, `uploads/` und `auth-secret` schreiben. Im Container das gemountete Volume. |
| `MITS_BACKEND_URL` | nein | web | `http://localhost:8000` | Adresse des KI-Backends. Im Stack von Compose gesetzt (`http://mits-backend:8000`); nur für lokale Entwicklung nötig. |
| `OLLAMA_BASE_URL` | nein | backend | `http://host.docker.internal:11434` | **Nur Fallback.** Gilt, solange in der UI keine URL gesetzt ist. |
| `OLLAMA_TEXT_MODEL` | nein | backend | `llama3.1` | **Nur Fallback** für das Routing-/Extraktionsmodell. |
| `OLLAMA_VISION_MODEL` | nein | backend | `llava` | **Nur Fallback** für die Texterkennung in Screenshots. |
| `OLLAMA_TIMEOUT_SECONDS` | nein | backend | `120` | Zeitlimit pro Ollama-Aufruf. Bei CPU-Inferenz eher erhöhen als senken. Nicht in der UI einstellbar. |

## Deployment mit Portainer (direkt aus der Repo-URL)

Portainer klont dieses Repository selbst und baut daraus beide Images. Es muss also
nichts lokal geklont, gebaut oder in eine Registry geschoben werden — die Repo-URL
genügt.

**Zero Config:** Es gibt keine Pflichtvariable. Repo-URL eintragen, *Deploy* klicken,
fertig. Beide Geheimnisse erzeugt MITS beim ersten Start selbst, die KI wird danach im
Browser eingerichtet.

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

### 2. Stack anlegen

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

### 3. Umgebungsvariablen: leer lassen

**Nichts eintragen.** Der Bereich *Environment variables* bleibt leer:

- `BETTER_AUTH_SECRET` und `MITS_SERVICE_TOKEN` werden beim ersten Start zufällig
  erzeugt und im Volume `mits-data` abgelegt — pro Instanz eigene Werte. Es liegt
  bewusst **kein** Standard-Secret in der Compose-Datei: ein konstanter Wert im
  Repository würde es jedem erlauben, auf jeder Instanz eine Admin-Session zu
  fälschen, die ihn nicht überschrieben hat.
- Ollama-Adresse und Modelle stellst du nach dem Deploy in der UI ein (Schritt 5).

Optional, falls die Instanz hinter einem Reverse Proxy hängt oder Port 3000 belegt
ist — sonst weglassen:

```
BETTER_AUTH_URL=https://mits.firma.de
MITS_WEB_PORT=8080
```

### 4. Deploy the stack

Der erste Build dauert einige Minuten (Next-Build und beide Images) und legt das
Volume `mits-data` an. Danach:

```
http://<host>:3000/register
```

**Das erste angelegte Konto wird automatisch Administrator.** Danach im Admin-Desk
entscheiden, ob sich weitere Nutzer selbst registrieren dürfen — und aus welchen
E-Mail-Domains.

### 5. KI in der UI einrichten

**Admin-Desk → KI-Einstellungen** (`/admin/settings/ai`):

1. **Basis-URL** eintragen:

   | Wo läuft Ollama? | Wert |
   |---|---|
   | auf demselben Docker-Host | `http://host.docker.internal:11434` — der Name ist in der Compose-Datei per `extra_hosts` auf das Host-Gateway gemappt |
   | auf einem anderen Server | `http://ollama.intern:11434` bzw. die IP |
   | in einem anderen Compose-Stack | Container per gemeinsamem Docker-Netz erreichbar machen, dann `http://<container>:11434` |

2. **Verbindung testen** — die Antwort listet die installierten Modelle.
3. **Textmodell** und **Vision-Modell** aus den Dropdowns wählen.
4. **Speichern.** Die nächste KI-Anfrage nutzt die Werte; kein Neustart, kein Redeploy.

Pro Feld gilt: Wert aus der UI → sonst Umgebungsvariable → sonst eingebauter
Standard. Ein leeres Feld heißt also „Fallback nutzen", nicht „kaputt".

### 6. Kontrollieren

```bash
# Erreicht das Backend seinen Fallback-Ollama? Welche Modelle liegen dort?
docker exec mits-backend python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').read().decode())"

# Läuft das Web?
docker logs mits-web --tail 20
```

Die Health-Antwort prüft den **Fallback** aus der Umgebung — ein reines GET kennt die
UI-Einstellungen nicht. Ob die *tatsächlich* benutzte Adresse steht, zeigt der Button
„Verbindung testen" in der KI-Einstellungsmaske.

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
| Deploy bricht sofort ab, „variable is not set" | Sollte nicht mehr vorkommen — keine Variable ist Pflicht. Tritt es auf: Stack zieht eine veraltete Compose-Datei, *Pull and redeploy*. |
| KI-Tab meldet „kein Service-Token verfügbar" | `mits-backend` hat das Volume `mits-data` nicht gemountet, oder der erste KI-Aufruf lief noch nicht (der erzeugt die Datei). |
| Build scheitert bei `npm ci` oder `pip install` | Docker-Host kommt nicht ins Internet oder ein Proxy fehlt. |
| „failed to read dockerfile" | Build method war *Web editor* statt *Repository*. |
| Login klappt, aber man bleibt abgemeldet | `BETTER_AUTH_URL` zeigt nicht auf die tatsächlich aufgerufene URL, oder HTTPS terminiert davor ohne passende Header. |
| KI-Tab meldet „Ollama nicht erreichbar" | Basis-URL unter `/admin/settings/ai` mit „Verbindung testen" prüfen. Sie muss aus Sicht des **Containers** stimmen, nicht vom eigenen Rechner aus. |
| KI meldet „Modell nicht vorhanden" | Modell auf dem Ollama-Host pullen, dann in den Einstellungen erneut testen und auswählen. |
| Alle Sessions nach jedem Redeploy weg | Das Volume `mits-data` wird nicht behalten — dort liegt der erzeugte `auth-secret`. |

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
