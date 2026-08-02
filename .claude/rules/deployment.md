---
paths:
  - "docker-compose.yml"
  - "Dockerfile*"
  - ".github/**"
  - "backend/Dockerfile*"
  - "src/app/api/mail/poll/**"
  - "src/lib/mail/**"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Images bauen, Registry, Portainer
## Deployment: gebaut in CI, gezogen in Portainer

Portainers „Pull and redeploy" fuehrt `docker compose pull` aus. Mit Images, die
nur als lokaler `build:`-Kontext existierten, scheiterte das an

```
pull access denied for mits-web, repository does not exist
```

— die Registry hatte von `mits-web:local` nie gehoert. Auf dem Docker-Host zu
bauen funktioniert zwar, macht aber jeden Deploy davon abhaengig, dass auf der
Maschine, die die Anwendung ausliefert, eine gesunde Build-Toolchain steht.

Also: gebaut wird in GitHub Actions (`.github/workflows/images.yml`), gezogen
wird aus `ghcr.io`. **`docker-compose.yml` behaelt seine `build:`-Abschnitte** —
beide Wege gehen aus derselben Datei:

```bash
docker compose up -d --build   # aus diesem Checkout bauen
docker compose pull && docker compose up -d   # was CI gebaut hat
```

**Das Paket ist nach dem ersten Lauf privat.** Einmalig unter
`github.com/users/bohannjein/packages` je Image auf *public* stellen — sonst
braucht Portainer Registry-Zugangsdaten fuer einen Pull. Bei einem
Open-Source-Repository ist oeffentlich die naheliegende Wahl; wer es privat
lassen will, hinterlegt in Portainer unter Registries ein GitHub-Token mit
`read:packages`.

**Zwei Tags je Bild:** `latest` folgt main, `sha-<kurz>` benennt genau einen
Build. Waehrend eines Vorfalls ist die zweite die Frage, die zaehlt — welcher
Stand laeuft. Zum Festnageln eines Stacks `MITS_IMAGE_WEB` und
`MITS_IMAGE_BACKEND` auf einen sha-Tag setzen.

**Bis der erste Lauf durch ist**, gibt es das Paket noch nicht und ein Pull
scheitert weiterhin. Dann auf dem Host einmal aus dem Stack-Verzeichnis heraus
bauen:

```bash
cd /data/compose/<stack-id>
docker compose up -d --build
```

## Postfach abrufen: der Zeitplan gehoert nach draussen

**Im Prozess laeuft kein Timer, und das ist Absicht.** Ein `setInterval` liefe je
Node-Worker — zwei Worker heisst jede Mail zweimal, also jedes Ticket doppelt.
Getrieben wird `POST /api/mail/poll`, mit dem Service-Token oder einer
Admin-Sitzung. **Ohne einen Job von aussen kommt eine Kundenantwort erst dann an,
wenn ein Admin in `/admin/mail` auf „Postfach abrufen" drueckt.**

```bash
curl -fsS -X POST -H "X-MITS-Service-Token: $(cat /data/mits/service-token)" \
     http://127.0.0.1:3112/api/mail/poll
```

Als Host-Cron, alle zwei Minuten:

```cron
*/2 * * * * curl -fsS -X POST -H "X-MITS-Service-Token: $(cat /data/mits/service-token)" http://127.0.0.1:3112/api/mail/poll >/dev/null
```

Ohne Host-Zugriff — etwa auf einer reinen Portainer-Instanz — als Sidecar im
Stack. **Nicht** in `docker-compose.yml` aufgenommen: wie oft ein Postfach
abgerufen wird, ist eine Betriebsentscheidung und keine Voraussetzung des Stacks.

```yaml
mits-mailpoll:
  image: curlimages/curl:latest
  restart: unless-stopped
  depends_on: [mits-web]
  volumes:
    - mits-data:/data:ro          # nur wegen des Service-Tokens
  entrypoint: ["sh", "-c"]
  command: >
    'while true; do
       curl -fsS -X POST -H "X-MITS-Service-Token: $$(cat /data/service-token)"
            http://mits-web:3000/api/mail/poll >/dev/null || true;
       sleep 120;
     done'
```

Zwei Dinge, die dabei schiefgehen:

- **Nicht zwei Jobs auf dieselbe Instanz.** Quittiert wird erst nach dem
  erfolgreichen Schreiben; zwei parallele Laeufe holen denselben ungelesenen
  UID-Satz und legen ihn doppelt ab.
- **Ein Job, der nie 200 bekommt, ist unsichtbar.** In MITS fehlt dann nichts —
  es sieht aus wie ein Postfach, in das niemand schreibt. `-f` im `curl` und ein
  Blick in das Cron-Log ist der ganze Unterschied zwischen „ruhig" und „seit
  Dienstag kaputt".

**Zwei Adressen, ein Rueckweg.** Gesendet wird als SMTP-`from`, abgerufen wird
`imapUser` bzw. `graphMailbox`. Sind die verschieden, setzt `sendMail` ein
`Reply-To` auf das abgerufene Postfach — sonst landete jede Antwort im
Absenderpostfach, das niemand liest. `/admin/mail` zeigt beide Adressen, wenn sie
auseinandergehen.
