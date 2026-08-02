---
paths:
  - "src/lib/notification*.ts"
  - "src/lib/notifications.ts"
  - "src/components/feedback/**"
  - "src/app/api/notifications/**"
  - "src/app/admin/settings/notifications/**"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Toast-Kanäle, Darstellung, Sammelmeldung
## Benachrichtigungen: Kanäle wie auf dem Telefon

`/admin/settings/notifications`, instanzweit. Vier Darstellungswerte (Ecke,
Anzeigedauer, Stapelhöhe, Abfrageintervall), drei Kanäle mit je Schalter,
Farbakzent und „bleibt stehen", plus die Schwelle für die Sammelmeldung.

**`feature_toast_notifications` bleibt der Hauptschalter.** Diese Seite formt,
was gezeigt wird, sie entscheidet nicht *ob*. Zwei Stellen, an denen
Benachrichtigungen verschwinden können, sind eine zu viel zum Nachsehen — die
Maske sagt es deshalb ausdrücklich, wenn das Modul aus ist.

**Instanzweit und nicht pro Konto.** Ein Admin, der einen Servicedesk einrichtet,
entscheidet, wie laut der Raum ist; vierzig Leute, die die Einstellung einzeln
entdecken, sind vierzig Gelegenheiten, den Kanal abzuschalten, der eine
Ticketübergabe meldet. Was pro Person bleibt, ist das Theme — eine Eigenschaft
des Browsers, an dem jemand sitzt.

**`NotificationSettingsSchema` ist flach** (`reply_enabled`, `reply_tone`, …)
statt pro Kanal verschachtelt. Genau die Verschachtelung hat in diesem Projekt
zweimal zugeschlagen (`z.record`, siehe `PortalConfigSchema`); flache
Defaultwerte haben die Eigenschaft, auf die es ankommt: `parse({})` liefert ein
vollständiges Objekt, eine Teilzeile fällt Feld für Feld auf den Default zurück
statt ganz verworfen zu werden. Ein verworfener Parse würde einen stummgeschalteten
Kanal wieder laut machen — und ein System, das lauter ist als eingestellt, sieht
nach einem ganz anderen Fehler aus.

**Kanalfilterung passiert im Client, Sichtbarkeit im Server.** Der Watcher
entscheidet, was *eingeblendet* wird; welche Zeilen eine Sitzung überhaupt kennen
darf, entscheidet weiterhin allein `listNotifications`. Der Cursor rückt auch bei
einem stummen Kanal vor — sonst kämen dessen Ereignisse bei jeder Abfrage erneut,
solange sie im Rückblickfenster liegen.

### Sammelmeldung

Ab `digestThreshold` Ereignissen in einer Abfrage (Default 5) ersetzt **eine**
Meldung den Stapel: „Während deiner Abwesenheit: …". Sie bleibt stehen, bis sie
weggeklickt wird — sie hat einen Stapel ersetzt, fünf Sekunden für zwölf
Ereignisse wären derselbe Fehler noch einmal.

- **Gerechnet wird immer, das Modell schreibt nur um.** `deterministicDigest`
  (`lib/notification-digest.ts`, kein `server-only`, in `npm test` abgedeckt)
  liefert die vollständige Antwort; `services/ai/digest.ts` versucht eine bessere
  Formulierung und gibt bei **jedem** Fehlerpfad das Gezählte zurück — Feature
  aus, Anbieter nicht erreichbar, Antwort unpassend, Timeout. Es gibt keinen
  Zweig, in dem das Einschalten weniger liefert als vorher.
- **Die Ereignisse werden serverseitig neu abgeleitet**, nie aus dem Request
  übernommen. Text vom Browser zusammenfassen zu lassen wäre eine
  Prompt-Injection-Fläche und ein Weg, sich über fremde Tickets berichten zu
  lassen.
- **Eigener Endpunkt.** `GET /api/notifications` läuft alle zwanzig Sekunden und
  muss ein billiger indizierter Read bleiben; die Sammelmeldung darf auf ein
  Modell warten und läuft nur bei der seltenen Abfrage, die einen Rückstau findet.
- **Beispiele werden mit Zeilenumbruch verbunden, nicht mit `·`.** Die
  Pool-Benachrichtigung enthält selbst einen zwischen Nummer und Titel — drei
  Beispiele lasen sich als fünf. In `npm test` festgehalten.
- **Die Zahl kommt nie vom Modell.** Eine Überschrift, die „drei Antworten" über
  vier Ereignisse schreibt, kostet das ganze Feature seine Glaubwürdigkeit.
