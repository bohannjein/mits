---
paths:
  - "src/lib/cmdb*.ts"
  - "src/app/mits/cmdb/**"
  - "src/app/admin/cmdb/**"
  - "src/app/api/v1/cmdb/**"
  - "src/components/tickets/ticket-assets.tsx"
  - "src/components/tickets/ci-icon.tsx"
  - "src/lib/organizations.ts"
  - "src/lib/api-tokens.ts"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# Objekte, Lizenzen, Firmen, Import und REST-Schnittstelle
## CMDB

Anlagen, Lizenzen und Firmen. Fünf Tabellen, ein Modul, hinter `feature_cmdb`.

| Tabelle | Inhalt |
|---|---|
| `mits_organization` | Firmen — Eigentümer von Objekten, Zuordnung für Anwender |
| `mits_configuration_item` | **jede** Objektart, Unterschiede in `attributes` (JSON) |
| `mits_ci_relation` | gerichtete Beziehungen, Umkehrung beim Lesen abgeleitet |
| `mits_ticket_ci` | welche Objekte ein Ticket betrifft, Paar als Primärschlüssel |
| `mits_user_profile.organization_id` | Firma einer Person (Spalte, keine eigene Tabelle) |

**Zwei Nummern pro Objekt, und sie beantworten verschiedene Fragen.**
`inventory_number` ist die Nummer, die MITS vergibt — fortlaufend, eindeutig,
angezeigt als `INV-10000001` (`formatInventoryNumber`). `asset_tag` ist die
**Fremdnummer**: ein Aufkleber, eine Nummer aus einem Altsystem, optional und frei.

- **Vergeben wird beim Einfügen, danach nie wieder.** `CIInput` lässt das Feld weg
  statt es optional zu machen — dieselbe Regel wie `created_by` beim Ticket, und ein
  Feld, das ein Formular füllen kann, kann auch ein handgebauter Request füllen. Im
  `INSERT` steht die Spalte, in der `DO UPDATE`-Liste **nicht**: eine Umbenennung darf
  keine Nummer verschieben, die schon auf einem Gerät klebt.
- **Ein soft-deletes Objekt behält seine Nummer**, und der Zähler läuft darüber
  hinweg (`MAX + 1`, ohne `deleted_at`-Filter). Die Nummer weiterzugeben hieße, dass
  ein altes Etikett auf etwas anderes zeigt.
- **Gesucht wird als Zahl, nicht als Text.** Der Zähler steht ohne Präfix und ohne
  führende Ziffer in der Spalte, ein `LIKE '%INV-1…%'` träfe also nie.
  `parseInventoryNumber` dreht das Format zurück; ein Suchbegriff, der keine Nummer
  ist, lässt die Klausel weg.
- **Der Import kann sie nicht setzen.** Die CSV-Spalte „Fremdnummer“ bildet auf
  `asset_tag` ab; die MITS-Nummer entsteht beim Speichern.

**Firma ist nicht Standort.** Eine Firma hat mehrere Niederlassungen, ein geteiltes
Gebäude beherbergt mehrere Firmen. Zusammenlegen war die naheliegende Abkürzung und
hätte „alle Objekte von Kunde X" unbeantwortbar gemacht.

**Eine Tabelle für alle Objektarten.** Was ein Notebook von einer Lizenz unterscheidet,
sind die Attribute — dieselbe Begründung wie bei schema-first Ticket-Typen: kein
`Laptop.tsx`, kein `mits_laptop`. Eine Spalte bekommt nur, was gefiltert oder sortiert
wird.

**Lizenzplätze werden nie gespeichert.** `seatCounts` zählt die `licensed_for`-Beziehungen
aus der Lizenz heraus; „belegt" ist eine Folge von Zuordnungen. Ein gespeicherter Zähler
plus eine Beziehungstabelle laufen beim ersten gelöschten Gerät auseinander, und die
Differenz wäre eine Compliance-Angabe, die niemand nachrechnet. Ein Ziel, das
soft-deleted ist, zählt nicht mit — der Platz wurde frei, als das Notebook verschrottet
wurde.

**`organization_id` am Profil ist nicht über `setUserProfile` schreibbar.** Der Parameter
lässt das Feld weg (`Omit<…, "organization_id">`), ein Aufruf mit Firma kompiliert nicht.
Nur `setUserOrganization` bewegt jemanden zwischen Firmen, und dieser Pfad prüft auf
Admin. Wer sich selbst in eine fremde Firma setzen könnte, würde deren Objektliste
filtern.

**Löschen:** Eine Firma wird verweigert, solange Objekte oder Personen daran hängen —
der Admin erfährt, was im Weg ist, statt eine stille Enteignung zu bekommen.
Deaktivieren bleibt der Normalweg. Ein Objekt wird soft-deleted (`deleted_at`, wie
Tickets), seine Beziehungen und Ticket-Zuordnungen dagegen echt gelöscht: das Objekt
trägt die Historie, die man zurückhaben will, eine Beziehung darauf nicht.

### Import und Schnittstelle

**Ein Codepfad für CSV und API.** `importItemRecords` nimmt `ImportRecord[]`; der
CSV-Importer bildet Spalten darauf ab, die API JSON-Felder. Alles danach — Abgleich per
Inventarnummer, Auflösung von Firma/Standort/Konto, Beibehalten nicht gelieferter Felder
— passiert einmal. Zwei Implementierungen von „aktualisiere das Objekt mit dieser
Nummer" unterscheiden sich genau in der Regel, auf die es ankommt.

**Alle Werte sind Strings**, auch Platzzahlen und Datumsangaben. Damit kann die API keine
Datumsform annehmen, die der CSV-Weg ablehnt.

**Zweimal geparst, absichtlich.** Die Maske parst im Browser für Kopfzeilen und Vorschau,
der Server erneut aus demselben Rohtext. Die Zeilen des Clients werden nie gesendet.
`lib/csv.ts` trägt deshalb **kein** `server-only` — drei Aufrufer (Maske, Server,
Offline-Suite), ein Parser.

**Weiche Fehler statt verworfener Zeilen.** Unbekannte Art → `other`, unbekannter Zustand
→ `active` (nicht `retired`: ein falsch als verschrottet importiertes Gerät verschwindet
unbemerkt aus Bestand und Lizenzzählung). Unauflösbare Firma → Feld leer plus Meldung.
Importiert wird Zeile für Zeile, nicht als eine Transaktion — ein echter Export ist
dreckig, und alles-oder-nichts scheitert bei Zeile sechshundert.

**Die API ist fail closed.** Kein hinterlegter Token heißt, Token-Authentifizierung ist
unmöglich, nicht dass sie übersprungen wird. Vergleich mit `timingSafeEqual` nach
Längenprüfung. Der Token wird genau einmal angezeigt — beim Erzeugen; danach ist nur
sichtbar, *dass* einer existiert. `/api/v1/*` liegt außerhalb des `proxy`-Matchers, ein
Maschinenaufruf bekommt also JSON statt eines Redirects auf die Anmeldung.

## CMDB im Ticket

Die Objekte lagen schon da (`mits_configuration_item`, `mits_ticket_ci`,
`TicketAssets`). Neu ist, was daran fehlte:

- **Ein Icon pro Objektart** (`components/tickets/ci-icon.tsx`). Eine Liste von
  Inventarzeilen ist eine Liste von Namen, und `MITS-NB-0431` und `MITS-NB-0413`
  haben dieselbe Form. In einer eigenen Datei, weil drei Seiten dieselben Zeilen
  rendern — drei Kopien der Zuordnung wären drei Chancen, dass eine Lizenz
  irgendwo wie ein Notebook aussieht.
- **Vorschläge in zwei Gruppen** statt einer Liste: „Dem Melder zugewiesen" und
  „Am selben Standort". Sie verdienen unterschiedliches Vertrauen, und
  zusammengeworfen gewinnt der erste plausible Name — an einem geteilten Standort
  regelmäßig das falsche Gerät. Die Zuordnung des Melders greift zuerst nach den
  Ids, ein Notebook, das beides ist, ist seines.

**Keine zweite `assets`-Tabelle.** Der Auftrag nennt eine; es gibt sie bereits als
`mits_configuration_item`, und dass es *eine* Tabelle für alle Objektarten ist,
ist eine dokumentierte Entscheidung. Eine zweite hieße zwei Bestände, von denen
der Lizenzzähler nur einen sieht.
