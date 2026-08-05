---
paths:
  - "src/lib/ticket-reminders.ts"
  - "src/lib/reminder-presets.ts"
  - "src/app/actions/reminders.ts"
  - "src/app/api/cron/reminders/**"
  - "src/components/tickets/reminder-popover.tsx"
  - "src/components/dashboard/reminders-widget.tsx"
---

# Erinnerungen: Snooze, Fälligkeit, Sammelanzeige

`feature_ticket_reminders`, an per Default. Ein Ticket auf später legen — Knopf am
Ticket, Einblendung bei Fälligkeit, Liste im Portal und in der Queue-Spalte.

## Pro Person, nie geteilt

`mits_ticket_reminder` hält je Erinnerung eine Zeile mit `user_id`. Zwei Agenten
auf einem Ticket haben zwei verschiedene Gründe, es wieder anzusehen; eine
geteilte Erinnerung hieße, dass der erste, der abhakt, den anderen stummschaltet.
Deshalb steht `user_id` auch vorn im Index — jede Abfrage lautet „was ist für
**mich** fällig".

**Das Paar (Ticket, Person) ist absichtlich nicht eindeutig.** „Nach dem Anruf
ansehen" und „Freitag nachfassen" sind zwei Erinnerungen; sie zu einer Zeile
zusammenzufassen würde die zweite still verwerfen. Gedeckelt ist stattdessen die
Zahl offener Erinnerungen pro Ticket und Person (`MAX_PER_TICKET`), damit eine
Schleife nicht Tausende Zeilen schreibt.

**Abgehakt statt gelöscht.** `is_done` bleibt stehen: eine Erinnerung, die
gefeuert und bestätigt wurde, ist der Nachweis, dass sich jemand gekümmert hat —
und der Haken im Widget muss im selben Render rückgängig zu machen sein. Das
Löschen daneben ist ein echtes `DELETE`, weil eine private Notiz an sich selbst
keine Historie hat, die es zu bewahren gäbe.

**Melder dürfen das auch.** Der Kanal ist nicht `staffOnly`: „Freitag nachfragen,
wenn nichts passiert ist" ist das Vernünftigste, was jemand tun kann, der auf ein
Ticket wartet — die Alternative ist, dass er am Dienstag fragt. Das Popover steht
deshalb auf beiden Detailansichten.

## Die Zeitrechnung liegt in einer Datei

`lib/reminder-presets.ts`, **kein** `server-only`: das Popover braucht die
Beschriftungen, der Server den Zeitpunkt, und das Einzige, was es nicht zweimal
geben darf, ist die Arithmetik. Nicht wegen der Sicherheit — ein gefälschter
Zeitpunkt wäre die eigene Erinnerung zur eigenen Wunschzeit —, sondern weil zwei
Implementierungen von „morgen 09:00" zweimal im Jahr auseinanderlaufen.

- **Das Formular schickt einen Preset-Namen oder eine `datetime-local`-Lesung**,
  niemals einen Zeitpunkt. `resolveReminderDue` löst beides in der Zeitzone der
  Instanz auf und ist die einzige Stelle mit den Grenzen.
- **`hours-2` und `days-3` sind reine Offsets** und werden bewusst *nicht* auf
  eine Uhrzeit gerundet: „in 2 Stunden" heißt in zwei Stunden, und das kürzeste
  Preset zu runden macht es zu dem, das am meisten lügt.
- **Nur `tomorrow-9` nennt eine Tageszeit** und braucht deshalb die Zeitzone.
  „Morgen" ist der nächste *Kalendertag* in dieser Zone, nicht jetzt plus 24 h:
  22:30 UTC ist in Berlin schon der Folgetag, und ein DST-Tag ist keine 24 Stunden
  lang.
- **`instantForZonedTime` braucht zwei Durchgänge.** Der erste Versuch behandelt
  die Wanduhrzeit als UTC und liegt damit um den Offset der Zone falsch; die
  Korrektur ist dieser Offset, gemessen durch Zurücklesen. Ein Durchgang landet in
  jeder Zone außer UTC in der falschen Stunde, der *zweite* fängt den Fall auf, in
  dem der Offset am Schätzwert ein anderer ist als am Ergebnis — die
  Zeitumstellung. In `npm test` mit Sommer, Winter und dem Umstellungswochenende
  festgehalten.
- **Eine Zeit in der Vergangenheit wird abgelehnt, nicht auf „jetzt" geklemmt.**
  Eine Erinnerung, die im Moment ihrer Anlage feuert, sieht aus wie ein kaputter
  Knopf; die ehrliche Antwort ist, dass das Datum falsch war.

## Fällig werden ist abgeleitet, nicht zugestellt

**Es gibt keine Benachrichtigungstabelle**, und zwar aus demselben Grund wie bei
Antworten und Zuweisungen (siehe `lib/notifications.ts`): ein gespeicherter
Zustellstapel bräuchte eine Zeile pro Person pro Ereignis, ein Zustellflag und
einen Aufräumjob, und der erste Schreiber, der das Fan-out vergisst, erzeugt eine
Meldung, die niemand bekommt.

Stattdessen leitet `dueReminders(userId, since)` bei jeder Abfrage ab:
`since < due_at <= now` **und** `is_done = 0`. Das Fenster ist, was die Meldung
genau einmal auslöst — der Cursor des Clients wandert danach darüber hinweg. Wer
vorher abhakt, löst gar nichts aus; das ist der ganze Sinn des Hakens.

**Der Zeitstempel des Ereignisses ist `due_at`, nicht `created_at`.** Eine letzte
Woche gesetzte Erinnerung, die in zehn Minuten fällig wird, muss *jetzt* neu sein;
mit `created_at` läge sie außerhalb des 24-Stunden-Rückblicks und würde nie
gemeldet.

## Der Cron-Endpunkt liefert nichts

`POST /api/cron/reminders`, Service-Token **oder** Admin-Sitzung, wie
`/api/mail/poll`. Er veröffentlicht ein inhaltsloses `notify`-Signal und sonst
nichts — was jede Person daraufhin erfährt, entscheidet weiterhin allein
`listNotifications`.

**Er ist nicht nötig, damit eine Erinnerung feuert.** Ohne Scheduler meldet sich
eine fällige Erinnerung innerhalb des Benachrichtigungsintervalls (20 s per
Default). Was er kauft, ist Pünktlichkeit — und auf einer Instanz mit *laufendem*
SSE-Stream ist das keine Feinheit: dort gibt es überhaupt kein Poll-Intervall, ein
ruhiger Desk holt also gar nichts ab, bis irgendetwas anderes passiert.

**Ein Signal an alle, nicht an eine Person.** `publish` kennt kein „nur an
diese Id" — `actorId` ist der *Ausschluss* des Verursachers. Eine Adressierung
dafür einzubauen wäre ein zweiter Adressierungsmodus in einem Bus, dessen ganzer
Vertrag „Signale, keine Daten" lautet. Der Preis ist ein Browser, der seinen
eigenen leeren Feed nachfragt; `audience: "all"`, weil ein Melder eine Erinnerung
auf seinem eigenen Ticket halten darf.

Einmal pro Minute ist der sinnvolle Eintrag. Häufiger kostet einen indizierten
Read und bringt nichts, was ein Mensch merkt; seltener macht die Presets zu
Lügnern.

## Darstellung

- **Das Badge zählt, es nennt nicht.** Eine Uhrzeit am Knopf wäre die vierte
  Metadatenangabe in einer Zeile, die schon Status, Priorität und Zuweisung trägt
  — und die einzige, die sich von selbst ändert. Auf einen Blick zählt *ob* etwas
  gesetzt ist; *wann* ist ein Klick entfernt.
- **Kein Emoji in der Einblendung.** Der Anforderungstext nennt „⏰ Erinnerung";
  Regel 3 gilt, das Signal trägt das `BellRing`-Icon des Toast-Kanals.
- **Die Zeitpunkte werden serverseitig formatiert.** Popover und Widget sind
  Client-Komponenten (jede Zeile ist ein Formular), also gehen fertige Strings
  hinüber — die Zeitzone der Instanz ist ein Server-Read, und `overdue` wird gegen
  die Serveruhr entschieden statt gegen die eines Laptops, dessen Zeit falsch geht.
- **Überfällig und anstehend in *einer* Liste**, nach `due_at` sortiert. In zwei
  Abschnitte geteilt stünde das, was seit gestern wartet, unter dem, was noch
  nicht fällig ist — die eine Sortierung, die eine Aufgabenliste nicht haben darf.
- **Bei leerer Liste rendert das Widget `null`.** Eine Karte mit „keine
  Erinnerungen" ist eine Dauererinnerung daran, dass es das Feature gibt, auf der
  Fläche, um die am meisten konkurriert wird.
- **Das Popover hat zwei `<form>`.** Ein Entfernen-Knopf im Anlege-Formular wäre
  ein verschachteltes Formular; der Browser verwirft das innere, der Knopf würde
  also die Anlege-Action mit leerem Datum abschicken.
- **Die Preset-Knöpfe tragen `name`/`value`, der Datums-Knopf nicht.** Genau das
  macht drei Knöpfe in einem Formular zu drei verschiedenen Presets. Ein
  verstecktes `preset`-Feld würde von *jedem* Submitter mitgeschickt, und „morgen
  09:00" gewänne jedes Mal gegen ein getipptes Datum.
