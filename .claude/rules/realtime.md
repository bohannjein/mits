---
paths:
  - "src/lib/services/realtime.ts"
  - "src/lib/realtime-backoff.ts"
  - "src/components/providers/**"
  - "src/hooks/**"
  - "src/app/api/realtime/**"
  - "src/app/api/tickets/**"
  - "src/components/tickets/*-live.tsx"
  - "src/components/tickets/detached-*.tsx"
  - "src/components/tickets/floating-*.tsx"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# SSE, Signale, Coalescing, Pop-out und angepinntes Fenster
## Echtzeit: gepusht, wo es geht

Drei Wege, absichtlich verschieden, weil die drei Dinge verschieden teuer sind.

| Was | Wie | Kosten im Leerlauf |
|---|---|---|
| Chat + Toasts | SSE, `/api/realtime/stream` | eine offene Verbindung, keine Abfrage |
| Queue-Liste | SSE-Signal, Ersatz: ETag / `304` | eine Kopfzeile alle 15 s im Ersatzmodus |
| Statistiken | In-Memory-Cache, 30 s | eine Berechnung pro Intervall statt pro Leser |

**Signale, keine Daten.** Ein Event sagt „Ticket X hat sich bewegt" und trägt
keinen Inhalt. Der Client holt danach über die Route, die es ohnehin gibt — und
damit bleibt es bei **einer** Stelle, die über Sichtbarkeit entscheidet. Ein Bus,
der Nachrichtentexte verteilte, wäre die zweite, und die zweite ist die, die man
falsch macht.

**SSE statt WebSockets.** Der Verkehr ist einseitig, SSE ist eine gewöhnliche
HTTP-Antwort, die jeder Reverse Proxy schon weiterleitet, und `EventSource`
verbindet selbst neu. Ein WebSocket brächte einen Rückkanal, den es hier nicht
gibt, und eine Deployment-Notiz für jeden Proxy davor. `X-Accel-Buffering: no`
ist Pflicht: nginx puffert proxied Responses per Default, und ein gepufferter
Event-Stream liefert erst, wenn ein paar Kilobyte zusammen sind — der häufigste
Weg, wie SSE lokal funktioniert und in Produktion nicht.

**Zwei Zustellwege, weil Next mehrere Worker fahren kann.** Dasselbe Problem wie
beim Mail-Timer, von der anderen Seite: ein In-Process-Emitter erreicht die
Hälfte der Browser. Also schreibt `publish` zusätzlich in `mits_realtime_event`,
und **ein** Pump pro Prozess liest, was er nicht selbst geschrieben hat. Pro
Prozess, nicht pro Verbindung: hundert Tabs auf einem Worker kosten denselben
`id > ?`-Read alle zwei Sekunden wie einer. Ohne Verbindung läuft kein Pump.

Der stille Fehler, den das verhindert: Echtzeit funktioniert für jeden, der
zufällig denselben Worker hat wie der Schreiber, und für die anderen nicht. Das
ist schlimmer als keine Echtzeit, weil es nicht reproduzierbar ist.

**Das Ticket in `?ticket=` wird einmal beim Verbinden autorisiert**
(`getTicketFor`), nicht pro Event. Pro Event wäre ein DB-Read im Fan-out für
etwas, das sich bei offener Verbindung nicht ändern kann.

**Ein `EventSource` pro Tab**, im Root-Layout. Browser deckeln gleichzeitige
Verbindungen pro Origin, und ein Stream ist eine Verbindung, die nie zurückkommt.
Die Seite meldet über `useRealtimeTicket`, was sie ansieht; der Provider
verbindet dann neu.

**Fällt der Stream aus, laufen die alten Abfragen weiter** — Ticketseite 2,5 s /
12 s, Queue 15 s gegen den ETag. Echtzeit, die auf *nichts* zurückfällt, ist
schlechter als Abfragen, weil der Ausfall unsichtbar ist. Der Punkt im Header
sagt, welcher Modus läuft: grün live, gelb Ersatz, grau im Aufbau. Icon **und**
Farbe, weil `--success` und `--warning` das Paar sind, das rot-grün-blinde Leser
am wenigsten trennen können.

**Reconnect mit Jitter** (`lib/realtime-backoff.ts`, in `npm test`). Der Jitter
ist der Teil, der weggelassen wird: ohne ihn kommen vierzig Tabs nach einem
Neustart alle bei 1 s wieder, dann alle bei 2 s — genau im Takt, in dem der
Server sich zu erholen versucht. `EventSource` verbindet zwar selbst neu, aber in
festem kurzem Abstand und ohne Obergrenze; deshalb wird die Verbindung geschlossen
und die Zeit selbst gesteuert.

**Der ETag ist pro Benutzer**, und das ist tragend statt ordentlich: sein Wert
kommt aus Zeilen, die der Aufrufer sehen darf. Ein geteilter ETag verriete jedem,
der ihn beobachtet, die Aktivität aller anderen. `private, no-cache`, nicht
`no-store` — letzteres verbietet dem Browser das Behalten und damit die
Revalidierung, die den ganzen Mechanismus ausmacht.

**Der Queue-Fingerabdruck kommt nicht aus `mits_ticket.updated_at`.** Die Spalte
wird beim Insert geschrieben und nie wieder angefasst, ein Statuswechsel bewegt
sie also nicht. Stattdessen vier indizierte Aggregate über Ticket, Audit-Log und
Kommentare: jeder Mutator schreibt ohnehin ins Log, und einer, der das vergäße,
wäre auch ein fehlender Historieneintrag — ein Fehler, den jemand bemerkt.

**Der Analytics-Cache ist auf den Zeitraum geschlüsselt, nicht auf den Benutzer.**
Nur zulässig, weil diese Zahlen nicht gescoped sind: `/api/analytics` ist als
Ganzes agentengesperrt und jeder, der daran vorbeikommt, sieht dieselben Werte.
Käme je eine melderseitige Sicht dazu, muss der Schlüssel eine Benutzer-Id
bekommen. Die Widget-Schalter stehen mit im Schlüssel, sonst sähe ein Admin nach
dem Einschalten eine halbe Minute lang nichts und hielte den Schalter für kaputt.
`?refresh=1` leert den ganzen Cache, nicht nur den angefragten Eintrag — wer den
Knopf drückt, hat gerade etwas geändert und wechselt gleich darauf ebenso
wahrscheinlich den Zeitraum.

## Was hundert gleichzeitige Chatter kostet

Vier Stellen, an denen die Echtzeit teurer war als nötig. Alle vier folgen
derselben Regel, die auch WhatsApp, Signal und Threema befolgen: **ein Ereignis
ist keine Aufforderung, alles neu zu laden.**

**Ein Burst ist eine Aktualisierung** (`hooks/use-coalesced-refresh.ts`). Jeder
Kommentar veröffentlicht ein `queue`-Signal an jeden verbundenen Agenten, und
jeder beantwortete es mit einem vollen `router.refresh()` — das sind auf der
Queue sieben Abfragen gegen einen synchronen SQLite-Treiber, der dabei die
Event-Loop für alle anderen blockiert. Zehn Nachrichten pro Sekunde waren zehn
komplette Renders **pro offenem Tab**. Jetzt: 1,5 s Fenster auf der Queue, 0,5 s
im Ticket, und nie mehr als eine Aktualisierung gleichzeitig unterwegs. Unter
Dauerlast degradiert der Client auf „so schnell, wie der Server antwortet",
statt Arbeit aufzustauen, zu der der Server noch nicht gekommen ist.

**Ein verborgener Tab gibt seine Verbindung zurück.** Das ist die Stelle, die
darüber entscheidet, ob MITS es übersteht, offen gelassen zu werden: über
HTTP/1.1 erlaubt ein Browser sechs Verbindungen pro Origin, und ein Event-Stream
ist eine Verbindung, die nie zurückkommt. Vier Tabs auf der Queue, und für die
Seitenaufrufe selbst bleibt nichts. Das Fehlerbild ist keine Meldung, sondern
eine Navigation, die hängt — nicht von einem langsamen Server zu unterscheiden.
Ein verborgener Tab hat niemandem etwas zu zeigen, also hält er auch nichts.

**Die Session wird einmal pro Anfrage aufgelöst** (`cache()` um
`getSessionUser`). Seit der Realtime-Provider im Root-Layout sitzt, taten es
Layout und Seite je einmal: zwei Better-Auth-Aufrufe, zwei Profil-Reads. Bei
einem synchronen Treiber blockiert jeder davon alle anderen.

**Die Aufräumlöschung des Event-Puffers läuft auf einem Timer**, nicht bei jedem
`publish`. Vorher war es ein zweiter Schreibvorgang pro Ereignis, also sechs pro
Kommentar statt drei.

**Neue Tickets melden sich jetzt überhaupt.** `createTicket` veröffentlichte
nichts — ein eingehendes Ticket erreichte die Queue erst über den Ersatz-Poll.
Das war eine Lücke, keine Entscheidung.

**Der Mailweg bleibt unverändert und funktioniert weiter.** Eine Antwort per
Mail geht durch `ingest` → `addComment`, und `addComment` veröffentlicht — sie
erscheint also live im Agenten-Chat wie jede andere Nachricht. Ausgehend
benachrichtigt `addCommentAction` weiter den Melder. Der Kunde chattet per Mail,
der Agent sieht einen Chat; daran ändert die Echtzeitschicht nichts, sie macht
den Weg nur schneller sichtbar.

### Warum eine geschlossene Meldung nicht in der Statistik stand

Nicht die Abfrage — die zählt `status_changed` mit `new_value IN ('closed',
'resolved')`, und beide Schließ-Wege gehen durch `setTicketStatus`, das den
Eintrag schreibt. Es war der **30-Sekunden-Cache**, den der Analytics-Schutz
mitgebracht hat.

Die Zahl war korrekt und der Cache tat seine Arbeit. Das Problem ist der
Zeitpunkt: der einzige Moment, in dem jemand eine Kennzahl nachsieht, ist direkt
nachdem er sie verändert hat — die einzige Veralterung, die je auffällt, ist
also genau die, die wie ein Fehler aussieht. `setTicketStatus`, `assignTicket`
und `createTicket` leeren den Cache jetzt.

Bei einem Kommentar bewusst nicht: das verschiebt zwar die Erstreaktionszeit,
aber niemand schließt ein Ticket und prüft danach den Median der Antwortzeiten.
Auf jeden Schreibvorgang zu leeren hieße, den Cache abzuschaffen.

## Ticket ausdocken: Pop-out und angepinntes Fenster

Zwei Wege aus dem Hauptfenster, **einer zur Zeit**. Zwei losgelöste Kopien
derselben Konversation heißen zwei Antwortzeilen, und die zweite ist immer die,
in die jemand tippt, obwohl sie ein paar Sekunden hinterherhängt. Erneutes
Ausdocken ersetzt, es addiert nicht.

| Weg | Was | Auslöser |
|---|---|---|
| `popout` | echtes Browserfenster, `window.open` | Knopf im Ticketkopf |
| `floating` | angepinntes Panel unten rechts | Knopf oder `p` |

**Das Panel ist ein `<iframe>` auf `/mits/tickets/[id]/popout`.** Das ist die
Entscheidung, die Begründung braucht, weil eine Komponente, die den Verlauf
direkt rendert, idiomatischer aussähe.

Der Verlauf wird serverseitig gerendert, und jede Regel darüber, wer was lesen
darf, liegt auf dieser Seite — `listCommentsFor` filtert interne Notizen in SQL,
`getTicketFor` antwortet bei fremdem Ticket mit `null`. Ihn im Client noch einmal
zu rendern hieße, einen zweiten Pfad zu haben, der Kommentare holt, und damit
eine zweite Stelle, die entscheidet, was herausgeht. Das ist der Fehler, den
dieses Projekt an jeder Stelle vermeidet, und ein iframe weniger ist ihn nicht
wert. Gleiche Origin, gleiches Session-Cookie, gleiche Guards, gleicher Stream.

**Die Pop-out-Route ist eine Route und wird wie eine bewacht.**
`requireRole("agent")` läuft dort ebenfalls. Erreichbar nur über einen Knopf auf
einer bewachten Seite zu sein, ist kein Schutz — es ist trotzdem eine URL, und
die Next-Docs sind eindeutig darüber, dass Proxy-Abdeckung lautlos verschwinden
kann.

Was dort **nicht** steht: Sidebar, Kopfleiste, Zurück-Link, überhaupt jede
Navigation. Ein 384 Pixel breites Panel mit einem Status-Dropdown darin ist ein
Bedienelement, dessen Beschriftung niemand lesen kann; und ein Pop-out, aus dem
man wegnavigieren kann, ist ein zweites Anwendungsfenster ohne Weg zurück. Der
Composer ist dort `plain` — die Formatierungsleiste bricht in dieser Breite auf
drei Zeilen um und frisst das Feld, zu dem sie gehört.

**Das Ausgeschnitten-Bild ersetzt Verlauf *und* Antwortzeile.** Den Composer
stehen zu lassen wäre genau die zweite Eingabe, die das Ganze verhindern soll.
Der Rest der Seite bleibt bedienbar, und die Karte sagt das auch.

**Der Zustand wird über einen `BroadcastChannel` geteilt**, nicht nur im eigenen
Tab. Ein zweiter Tab auf demselben Ticket zeichnet den Ausschnitt mit — sonst
zeigte er einen lebendigen Verlauf, den niemand liest, und eine dort getippte
Antwort ginge in ein Fenster, auf das der Mensch nicht schaut. Der Kanal trägt
eine Ticket-Id und einen Modus, sonst nichts.

**Ein Fenster, das über seine eigene Titelleiste geschlossen wird, meldet dem
Öffner nichts.** Deshalb zwei Wege: `PopoutAnnouncer` sendet auf `pagehide`
(nicht `beforeunload` — das wird gedrosselt, ohne Geste ignoriert und auf
Mobilbrowsern oft gar nicht ausgelöst), und der Provider pollt zusätzlich
`window.closed` im Sekundentakt. Zusammen verschwindet der Ausschnitt entweder
sofort oder innerhalb einer Sekunde — nie gar nicht.

**Das Panel darf sich nicht selbst enthalten.** Der Provider sitzt im Root, also
hat auch das Pop-out-Dokument einen, und der Kanal teilt ihm brav mit, dass ein
Ticket ausgedockt ist. Sein `FloatingTicket` öffnete dann ein iframe auf die
Pop-out-Route, deren Dokument dasselbe täte. Zwei Bedingungen halten das an, weil
die beiden losgelösten Ansichten verschieden sind: das Panel ist ein Frame
(`self !== top`), das Pop-out ein Top-Level-Fenster auf dem `/popout`-Pfad.

**`p` pinnt an, es öffnet kein Fenster.** `window.open` aus einem Tastendruck
blockiert jeder Popup-Blocker, der nichts anderes gelernt hat — Browser vertrauen
dafür nur einem Klick. Eine Taste, die auf der Hälfte der Installationen still
nichts tut, wäre schlechter als keine.

**Die Antwortzeile ist doppelt gesichert.** Ab `lg` ist sie ein `shrink-0`-
Geschwister des Scrollcontainers und kann sich schon deshalb nicht bewegen.
Darunter gibt es keine begrenzte Spalte, gegen die sich das halten ließe, und die
Zeile säße am Ende eines langen Verlaufs — dort und nur dort ist `sticky
bottom-0` das richtige Werkzeug: es hängt am Viewport, nicht an einem
Scrollcontainer, es gibt also keinen Sticky-Kontext, über den etwas uneinig sein
könnte. Deckend (`bg-background`) und `z-10`, weil Bubbles darunter durchlaufen.

## Systemzustand statt Dauerampel

`/admin/status`, gespeist aus `lib/system-status.ts`. Eine Zeile je Teilsystem:
Datenbank, Mailversand, Postfach-Abruf, Dateispeicher, KI, Zeit, Schnittstellen
— dazu die Live-Verbindung, die nur der Browser kennt.

- **Konfigurationszustand, keine Erreichbarkeit.** Die Seite öffnet keinen
  Socket. Eine, die beim Laden SMTP, S3, Ollama und einen Zeitserver anwählt,
  dauert so lange wie der langsamste davon und läuft genau dann in einen
  Timeout, wenn die Instanz ohnehin Ärger hat. Die echten Tests sitzen
  weiterhin je Teilsystem hinter einem Knopf; jede Zeile verlinkt dorthin.
- **Ein abgeschaltetes Modul ist kein Fehler.** Aus ist grau. Gelb ist genau der
  Fall, der etwas kaputt macht: eingeschaltet und nicht konfiguriert. Diese
  Unterscheidung ist der ganze Wert der Liste.
- **Der Punkt wiederholt, was das Zustandswort sagt.** Farbe allein ist das
  Einzige, was ein rot-grün-blinder Leser nicht verwerten kann, und diese Liste
  wird genau dann gelesen, wenn Raten teuer ist.
- **Nur Admins.** Die Zeilen nennen Hosts, Buckets und Postfächer — die
  Konfiguration der Instanz, nichts, was ein Agent auf dem Weg zum Ticket
  braucht.
