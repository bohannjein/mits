---
paths:
  - "src/lib/services/ai/**"
  - "src/lib/ai-settings.ts"
  - "src/app/api/ai/**"
  - "src/app/admin/settings/ai/**"
  - "backend/**"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Opt-in-Architektur, Provider, Triage-Pipeline
## KI-Assistenz: opt-in, sonst gar nicht

Vier Zusatzfunktionen, alle einzeln schaltbar unter `/admin/settings/ai`. Die Regel
darüber ist die eigentliche Architektur: **MITS ist ohne Modell ein vollständiges
Ticketsystem**, und keine dieser Funktionen stellt eine Anfrage, die nicht jemand
eingeschaltet hat.

| Schalter | Default | Braucht ein Modell? |
|---|---|---|
| `enabled` (Hauptschalter) | **an** | — |
| `clustering` | aus | nein, nur für die Überschrift |
| `summary` | aus | ja |
| `routing` | aus | ja |
| `deflection` | aus | nein |
| `digest` | aus | nein (formuliert nur um) |

**Der Hauptschalter ist an, die vier Funktionen sind aus.** Kein Widerspruch: der
Hauptschalter deckt auch die KI-Triage ab, die es vor dieser Seite schon gab, und
eine funktionierende Funktion beim Update still zu entfernen ist kein Opt-in
sondern eine Regression. Alles *Neue* ist aus.

**Zwei Funktionen laufen ohne Modell.** Das Gruppieren ähnlicher Tickets ist
Mengenarithmetik (`services/ai/similarity.ts`), die FAQ-Suche ist lexikalisch
(`services/ai/deflection.ts`). Beide sind rein und in `npm test` abgedeckt — das
ist der Grund, warum sie so gebaut sind: sie laufen bei jedem Queue-Render
beziehungsweise bei jeder Tippause, und ihre Fehler sind in beide Richtungen
still. Ein Modell schreibt beim Clustering nur die Überschrift und fällt bei
jedem Fehler auf die geteilten Wörter zurück; eine abgelaufene API-Schlüssel darf
keine Großstörung verschwinden lassen.

**Was Jaccard allein nicht kann.** Drei echte Meldungen derselben Störung
(„Outlook startet nicht mehr“ / „Outlook geht nicht“ / „Outlook lässt sich nicht
starten“) kommen auf 0,67 / 0,25 / 0,20 — bei Titeln aus zwei bis drei Tokens
kostet jedes ungeteilte Wort ein Drittel. Deshalb gilt zusätzlich: **ein geteiltes
Wort ab fünf Zeichen genügt.** Die Absicherung dagegen ist nicht die Schwelle,
sondern `clusterMinTickets`. **Paraphrasen ohne gemeinsames Wort werden nicht
erkannt** — „Outlook offline“ und „E-Mail geht nicht“ gruppieren nie. Das bräuchte
Embeddings, einen Vektorspeicher und einen Reindex-Job, und der driftet als
erstes von den Artikeln weg.

**Nichts passiert automatisch.** Das Banner ist ein Vorschlag mit zwei Knöpfen.
Eine Hauptstörung anzulegen setzt fremde Tickets auf „Wartet auf Hauptstörung“,
und das auf Wortüberschneidung hin falsch zu tun zahlen die Melder.

**`Ignorieren` merkt sich Tickets, nicht Gruppen.** Eine Gruppe hat keine
Identität — sie wächst. Auf die Gruppe geschlüsselt wäre die Ausblendung entweder
sofort hinfällig oder dauerhaft. Auf die Mitglieder geschlüsselt bleibt sie ruhig,
bis ein *neues* Ticket dazukommt, und genau dann ist sie wieder erwähnenswert.

**Der Provider ist eine Datei, kein SDK.** `services/ai/provider.ts` spricht
Ollama, OpenAI und Anthropic über `fetch`. Die drei offiziellen Clients wären
zweistellige Megabyte für einen POST pro Anbieter; der einzige echte Unterschied
ist die Structured-Output-Direktive — Ollamas `format`, OpenAIs `json_schema`,
Anthropics erzwungener Tool-Call. **Strukturierte Ausgabe ist Pflicht, nicht
Bitte:** ein Modell, das JSON frei schreibt, liefert oft genug Unparsebares,
dass der Fehler zum Normalzustand der Funktion wird. Deshalb sind in allen
Schemata alle Felder `required` und `additionalProperties: false` — OpenAIs
`strict` verlangt es, und ein Modell lässt sonst das Feld weg, das ihm am
schwersten fiel.

**Die Zusammenfassung wird nie gespeichert.** Sie ist im Moment der nächsten
Antwort veraltet, und eine veraltete Zusammenfassung ist schlimmer als keine: sie
ist selbstsicher falsch über den aktuellen Stand, und genau den liest jemand
darin nach.

**Verschlagwortung blockiert das Anlegen nicht.** `tagTicketInBackground` wird
bewusst nicht awaited und schluckt alles — anders als die Eingangsmail eine
Zeile darüber, deren Verlust Information kostet. Ein Melder wartet nicht auf ein
Modell, und ein Modell, das steht, macht aus einem Ticket keinen Fehler.

**Der Routing-Vorschlag ist ein Tag, keine Umsortierung.** `passt-eher:<id>`,
gegen den echten Katalog geprüft. Ein Modell, das Tickets still zwischen Queues
schiebt, schiebt manche falsch, und niemand weiß welche.

**`lib/services/ai/tags.ts` trägt kein `server-only`** — drei Aufrufer: der
Ticket-Kopf, `routing.ts` und die Offline-Suite. Gleiche Begründung wie bei
`lib/csv.ts`.

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
