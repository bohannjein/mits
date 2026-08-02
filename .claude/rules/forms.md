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

**`location` und `user` sind Picker, keine Fremdschlüssel.** Ihre Optionen kommen zur
Laufzeit aus `mits_location` bzw. der Benutzerliste und werden per Context übergeben — nicht
ins Schema einbetoniert, sonst wäre die Liste nach jeder neuen Filiale veraltet. Validiert
wird als String: ein `enum`, das beim Anlegen des Formulars festgeschrieben würde, würde die
Payload jedes bestehenden Tickets ungültig machen, sobald ein Standort umbenannt wird. Der
geprüfte Standort ist die Spalte `mits_ticket.location_id`, nicht dieses Payload-Feld.
Personen gehen **nur mit Id und Name** an den Browser — `listUsers()` liefert auch Adresse
und Rolle, und ein Ticketformular hat keinen Grund, jedem Melder ein Adressbuch zu geben.
