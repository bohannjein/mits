---
paths:
  - "src/lib/analytics/**"
  - "src/lib/services/analytics-cache.ts"
  - "src/app/mits/analytics/**"
  - "src/app/api/analytics/**"
  - "src/components/charts/**"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Kennzahlen, Zeiträume, Caching, Diagrammfarben
## Statistiken

`/mits/analytics`, Agenten und Administration. Gesteuert unter
`/admin/settings/analytics`: Default-Intervall plus acht Widget-Schalter, alle an.

**Anwender kommen nicht rein — an drei Stellen.** `requireRole("agent")` auf der
Seite, `requireApiRole("agent")` auf `/api/analytics`, und kein Link: der
Statistik-Knopf sitzt in `/mits`, wohin das Benutzermenü einem `user` ohnehin
keinen Weg zeigt. Die Seite zu verstecken und die Route offen zu lassen wäre
sinnlos — die Zahlen liegen in der Route.

**Das Panel ist eine Client-Komponente mit einem Endpunkt**, anders als jede
andere Liste in MITS. Grund ist der Auto-Refresh: eine sich neu ladende Seite
würde bei jedem Tick alle Charts neu mounten, und genau das harte Springen soll
weg. Über TanStack Query landen neue Zahlen in *denselben* Chart-Instanzen und
recharts morpht. `placeholderData` hält die alten Daten stehen, während die
neuen kommen — sonst leert jeder Filterwechsel neun Karten und füllt sie wieder.

**Serien enthalten jeden Bucket, auch die leeren.** Zwei Gründe, beide wichtig:
ein Chart nur aus Buckets mit Daten zieht eine gerade Linie über ein
ticketfreies Wochenende, und recharts kann nur zwischen Arrays gleicher Form
interpolieren — bei wechselnder Länge bleibt ihm nur Neuzeichnen.

**Alles UTC.** Zeitstempel sind ISO-Strings und werden als Strings verglichen, also
muss eine Bucket-Grenze UTC-Mitternacht sein. Die Anzeige-Zeitzone ist eine
*Render*-Einstellung und greift hier absichtlich nicht durch; das Panel sagt es
einmal, statt jede Grenze zweimal im Jahr still zu verschieben.

**Lösungszeit und Erstreaktion kommen aus `mits_audit_log` beziehungsweise
`mits_ticket_comment`,** nicht aus einer Spalte. Eine Spalte wäre eine zweite
Wahrheit. Die Folge steht im Panel: ein vor Einführung der Historie geschlossenes
Ticket zählt nicht mit, die Datenbasis ist kleiner als die Ticketzahl.

**Median *und* Mittel.** Sie widersprechen sich hier auf eine Art, die zählt: ein
über Weihnachten offenes Ticket verschiebt das Mittel um Tage und den Median gar
nicht.

**Gelöst-je-Agent hängt am Akteur im Audit-Log**, nicht an `assigned_to` — wer
geklickt hat, hat es getan, und ein Ticket wechselt vor dem Abschluss auch mal
zweimal den Besitzer.

**Die Heatmap ist ein CSS-Grid, kein recharts-Chart.** recharts hat keine
Heatmap, und eine aus einem Scatter mit quadratischen Shapes zu bauen kämpft
gegen die Bibliothek für ein schlechteres Ergebnis als 168 gestylte Zellen.

**Chart-Farben sind Tokens.** `--chart-1..6` und `--heat-0..4`, je Theme eigene
Werte — recharts nimmt `var(--chart-1)` direkt als `fill`. Die im Auftrag
genannten Hex-Werte sind die Light-Werte und stehen genau dort. Auf Dark sind sie
angehoben und leicht entsättigt: dasselbe Indigo, das auf Weiß souverän wirkt,
ist auf Beinahe-Schwarz ein Loch.

## Der Statistik-Knopf sitzt am Tortendiagramm

Nicht mehr als Pille neben „CMDB" in der Queue-Kopfzeile. Zwei gleich große
Bedienelemente sagen, dass zwei Dinge gleich wichtig sind, und das sind sie
nicht: die CMDB ist ein Ort, an dem Agenten arbeiten, die Statistiken einer, an
den sie gelegentlich schauen. Der Link steht jetzt als Textlink über den Zahlen,
die er aufschlüsselt.

**Zusätzlich im Benutzermenü**, weil `StatsTiles` hinter
`feature_stats_heatmap` liegt — sonst hätte eine Instanz mit ausgeschaltetem
Widget ein Statistik-Panel ohne jeden Weg hinein. Gegated auf `canViewBoard`, wie
jeder andere Bereichswechsel dort.
