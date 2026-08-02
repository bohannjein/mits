---
paths:
  - "src/lib/services/storage.ts"
  - "src/lib/services/s3*.ts"
  - "src/lib/storage.ts"
  - "src/app/admin/settings/storage/**"
  - "src/app/api/uploads/**"
  - "src/app/api/tickets/upload/**"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert hat,
  ist wann er geladen wird.
-->

# Dateiablage: Platte oder S3

**Der Speicherort steht an jeder Datei, nicht nur in der Einstellung.**
`mits_upload.storage` entscheidet beim Lesen. Würde stattdessen die aktuelle
Einstellung gelten, wäre im Moment des Umschaltens auf S3 das komplette bestehende
Archiv 404 — bei einer Seite, die „gespeichert“ meldet.

**SigV4 ist selbst gebaut** (`lib/services/s3-sign.ts`), gegen die AWS-Testvektoren
in `npm test` geprüft. Das AWS-SDK wären zwanzig Megabyte für drei Request-Formen.
Der Grund für die Vektoren: eine falsche Signatur kommt als
`SignatureDoesNotMatch` zurück und sagt nichts darüber, welcher der sechs Schritte
schiefging.

**Es gibt keinen Mail-Timer im Prozess.** Ein `setInterval` liefe je Node-Worker —
zwei Worker heißt jede Mail zweimal, also jedes Ticket doppelt. Getrieben wird über
`POST /api/mail/poll` mit dem Service-Token (oder dem Admin-Button). Eine Nachricht
wird erst **nach** dem erfolgreichen Schreiben als gelesen markiert; andersherum
verlöre ein fehlgeschlagener DB-Write die Mail lautlos.

**Die Betreffnummer allein hängt bei einem fremden Absender nichts an.** Die
Zuordnung einer eingehenden Antwort läuft über die Nummer in eckigen Klammern
(`ticketNumberFromSubject`, Form `[TCK-1000000000001042]`) — und der Zähler dahinter
läuft ab 1 hoch, `[42]` wird
akzeptiert, ein `From` ist in einer Minute gefälscht. `getTicketByNumberFor` fragt
„darf dieses **Konto** das Ticket sehen"; bei einem Absender ohne Konto ist das
Konto das Auffang-Konto, und das ist Technik — die Antwort wäre also für jedes
Ticket der Instanz ja. `applyReply` verlangt deshalb zusätzlich, dass Absender und
`created_by_email` dasselbe Postfach sind (`sameMailbox`, in `npm test`). Passt es
nicht, wird die Mail ein **neues** Ticket samt Notiz im Abrufbericht: wer an den
Support schreibt, hat eine Antwort verdient — Schreibrecht in einem fremden
Gespräch nicht.

`sameMailbox` hält leer gegen leer für **nicht** gleich. Ein Ticket ohne
Melderadresse wäre sonst für jede Nachricht ohne Absender offen.

**Mail-Eigentümerschaft kommt nie aus der Nachricht.** Kennt MITS die Absenderadresse,
ist es deren Ticket. Sonst läuft es unter dem konfigurierten Auffang-Konto, während
`created_by_email` die echte Adresse behält — Sichtbarkeit beim Konto, Antwortweg
beim Menschen. Ein unauthentifizierter Absender legt **kein** Konto an. Die beiden
schmalen Ausnahmen heißen `MailIngestOrigin` und `MailAuthorOrigin` und sind
absichtlich benannt statt in ein Options-Objekt gesteckt.

**Eine gemailte Antwort ist nie Team.** `addComment` setzt `author_is_agent` auf
`false`, sobald ein `origin` mitkommt — sonst stünde eine Kundenantwort, die unter
einem Agenten-Auffangkonto abgelegt wird, rechts in der Agenten-Bubble, und die
Benachrichtigungsregel schickte dem Melder seine eigenen Worte zurück.

**Makros senden nur, wenn ein Admin das so eingestellt hat.** `reply_mode: "insert"`
ist Default und folgt der Hausregel. `"send"` ist die dokumentierte Ausnahme: der
bestätigende Mensch ist dann der Admin, der den Text geschrieben und das Makro so
markiert hat — nicht der Client. `saveMacrosAction` lehnt wirkungslose Makros und
tote Baustein-Verweise ab; ein Makro, das „ausgeführt“ meldet und nichts bewegt,
ist schlechter als kein Knopf.

**Der Toast liegt in `components/feedback/`, nicht in `components/ui/`.** Regel 1:
`ui/` ist CLI-verwaltet, und shadcn hat kein `toast` mehr (die Registry zeigt auf
`sonner`). Gleiche Begründung wie bei `components/forms/form.tsx`.
