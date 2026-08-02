---
paths:
  - "src/lib/forms/**"
  - "src/components/forms/**"
  - "src/lib/mock-schemas.ts"
  - "src/lib/form-schemas.ts"
  - "src/components/admin/schema-builder.tsx"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Schema-Compiler, bedingte Sichtbarkeit, abhängige Dropdowns
## Bedingte Felder und abhängige Auswahl

`uiHints[feld].visibleWhen` und `uiHints[feld].optionsFrom` steuern beides. Der Punkt, der
zählt: **beide werden aus den Antworten abgeleitet, nie aus einer Angabe des Clients.** Der
Browser blendet aus, und der Server kommt mit derselben Payload unabhängig zum selben
Ergebnis — `createTicket` gibt `values: draft.payload` an `schemaToZod`. Ein Client, der
behauptet „das war versteckt“, wird nicht gefragt.

Ohne das wäre es kaputt in beide Richtungen: ein verstecktes **Pflichtfeld** würde
serverseitig weiter verlangt und das Formular ließe sich nie absenden, und eine Antwort auf
eine nie gestellte Frage käme unbemerkt in die Datenbank.

- **Sichtbarkeit ist keine Sicherheitsgrenze.** Ein verstecktes Feld ist aus dem kompilierten
  Schema entfernt und seine Antwort wird vor dem Absenden verworfen — aber ein handgebauter
  Request kann das Feld trotzdem mitschicken. Grenze bleibt `strictObject` in `createTicket`.
- **Auflösung als Fixpunkt, nicht in einem Durchlauf.** Eine Bedingung darf auf ein selbst
  bedingtes Feld zeigen, und ein verstecktes Steuerfeld gilt **nicht** als Treffer — sonst
  bliebe ein Feld sichtbar wegen einer Antwort auf eine Frage, die nie gestellt wurde. Ein
  Zyklus endet mit beiden versteckt statt in einer Endlosschleife.
- **Werte werden als String verglichen.** Eine Bedingung auf Checkbox/Schalter lautet
  `equals: ["true"]`. Ein Array-Steuerfeld (Multiselect) trifft, wenn **ein** gewählter
  Eintrag gelistet ist. Leerer String trifft nie.
- **Eine Kaskade spiegelt die Vereinigung ihrer Werte ins `enum` des Feldes.** Sonst
  beschreibt das an Ollama gegebene Schema ein Freitextfeld und das Modell erfindet Werte,
  die nichts annimmt.
- **`saveFormSchemaAction` lehnt Bedingungen auf nicht existierende Felder ab**
  (`danglingConditions`). Ein toter Verweis versteckt sein Feld dauerhaft; ist es ein
  Pflichtfeld, ist das Formular für alle unabsendbar — und nichts auf dem Schirm erklärt es.
- **`feature_advanced_form_builder` schaltet nur das Bearbeiten ab, nicht die Auswertung.**
  Ein Admin-Schalter darf nicht die Pflichtfelder bereits veröffentlichter Formulare
  verändern; sonst kippen Formulare, die niemand angefasst hat.

## Agenten-Checkliste am Ticket-Typ

`schema.checklist` — Schritte, die der Agent auf **jedem** Ticket dieses Typs
abarbeitet, gepflegt im Formular-Builder (eigene Karte über dem Canvas). Sie stehen
nicht im Formular des Melders: das Schema beschreibt, was *gefragt* wird, die
Checkliste, was *getan* wurde. Zweck ist Nachvollziehbarkeit, deshalb hält jede
Antwort Name und Zeitpunkt, und deshalb ist nichts jemals gesperrt.

Zwei Arten, mehr gibt es nicht: `check` (ein Haken) und `yesno` (Ja / Nein). Das
zweite ist kein Luxus — „Ersatzteil vorhanden?" hat ein *Nein*, das etwas bedeutet,
und ein leerer Haken ist von „noch nicht dran gewesen" nicht zu unterscheiden.

- **Die Schritte liegen im Schema, die Antworten in `mits_ticket_checklist`.**
  Gekoppelt über die Schritt-Id, und die wird beim Anlegen erzeugt, **nie** aus dem
  Label abgeleitet: ein Admin, der einen Tippfehler korrigiert, würde sonst die
  Antworten aller offenen Tickets verwaisen lassen.
- **Das Schema entscheidet, was existiert.** Eine Zeile zu einem entfernten Schritt
  wird nicht gelesen und nicht gelöscht — ein Schritt kann zurückkommen, und die
  Antwort ist die Aufzeichnung tatsächlich getaner Arbeit.
- **Doppelte Ids lehnt `saveFormSchemaAction` ab.** Der Builder kann keine erzeugen,
  die JSON-Spalte schon: zwei Schritte mit einer Id teilen eine Zeile, das Beantworten
  des einen beantwortet den anderen — eine Doku-Funktion, die still etwas festhält,
  was nicht passiert ist.
- **Geprüft wird gegen das Schema, nicht gegen den Request.** `setChecklistValue`
  lehnt eine Id ab, die der Typ nicht kennt, und einen Wert, den die Art nicht
  tragen kann. Ein `yes` auf einem Haken käme sonst als „unbeantwortet" zurück und
  sähe wie ein verlorener Schreibvorgang aus.
- **Jeder Schreibvorgang ist ein `checklist_set` im Audit-Trail**, inklusive
  Zurücknehmen. Das Panel zeigt den Zustand, die Historie die Reihenfolge — und
  genau die ist die Frage, mit der jemand später kommt.
- **Kein Feature-Flag.** Ein Typ ohne Schritte hat kein Panel; das ist der Schalter.
- **Nur Agenten**, geprüft in `setChecklistValue` und nicht bloß in der Action. Beim
  Melder wird das Panel gar nicht gerendert, und `publish` schickt kein `notify`:
  eine Benachrichtigung über interne Doku wäre ein Einblick in laufende Arbeit.

**`location` und `user` sind Picker, keine Fremdschlüssel.** Ihre Optionen kommen zur
Laufzeit aus `mits_location` bzw. der Benutzerliste und werden per Context übergeben — nicht
ins Schema einbetoniert, sonst wäre die Liste nach jeder neuen Filiale veraltet. Validiert
wird als String: ein `enum`, das beim Anlegen des Formulars festgeschrieben würde, würde die
Payload jedes bestehenden Tickets ungültig machen, sobald ein Standort umbenannt wird. Der
geprüfte Standort ist die Spalte `mits_ticket.location_id`, nicht dieses Payload-Feld.
Personen gehen **nur mit Id und Name** an den Browser — `listUsers()` liefert auch Adresse
und Rolle, und ein Ticketformular hat keinen Grund, jedem Melder ein Adressbuch zu geben.
