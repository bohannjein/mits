---
paths:
  - "docker-compose.yml"
  - "Dockerfile*"
  - ".github/**"
  - "backend/Dockerfile*"
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
