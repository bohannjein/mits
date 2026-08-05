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

### Der Export ist das Eingabeformat

`GET /api/v1/cmdb/items?format=csv` (Knopf „CSV" auf `/mits/cmdb`, trägt den
aktuellen Filter mit). `lib/cmdb-export.ts`, ohne `server-only`, rein — die
Offline-Suite besitzt den Rundlauf.

**Jeder Spaltenkopf wird von `guessColumnMapping` auf genau das Feld
zurückgeraten, aus dem er kommt.** Exportieren, in Excel vierhundert Standorte
korrigieren, zurückspielen — ohne eine Spalte von Hand zuzuordnen. `EXPORT_COLUMNS`
führt das Ziel deshalb neben dem Kopf, und der Test rät die Kopfzeile und
vergleicht. Ein umbenannter Kopf ohne mitgezogene Rateregel verliert beim
Rückspielen still eine Spalte, und der Import meldet trotzdem Erfolg.

**`inventory_match` ist ein Zuordnungsschlüssel, kein Wert.** Die MITS-Nummer
findet die Zeile und kann sie nie schreiben — vergeben wird beim Insert. Das ist
nicht Kosmetik: der Abgleich lief nur über `asset_tag`, und der ist optional. Ein
Export einer frischen Instanz kam als **vollständiger zweiter Bestand** zurück,
gemeldet als vierhundert Neuanlagen. Bei Widerspruch gewinnt die Nummer: sie
bezeichnet die Zeile, der Aufkleber ist eines ihrer Felder.

**Abgeleitete Werte werden nicht exportiert.** Belegte Lizenzplätze zählt
`seatCounts` aus den Beziehungen; eine Spalte dafür würde beim Rückspielen als
`seats_total` geraten und die lizenzierte Zahl mit der belegten überschreiben.

- **Referenzen als lesbare Werte**, nicht als Ids — ein Export voller UUIDs ist
  einer, den niemand bearbeitet. Ein Ziel, das es nicht mehr gibt, wird leer und
  nicht zur rohen Id.
- **Attributspalten heißen `attr:<Schlüssel>`**, eine je Schlüssel im gesamten
  Ausschnitt, alphabetisch — damit zwei Exporte desselben Bestands sich sauber
  diffen lassen. `mappingForSubmit` präfigiert einen schon präfigierten Kopf nicht
  doppelt.
- **Semikolon und CRLF**, wie der Analytics-Export: `sniffDelimiter` prüft
  Semikolon zuerst, deutsches Excel liest es ohne Importdialog.
- **Leerer Ausschnitt heißt Kopfzeile ohne Zeilen.** Eine leere Datei liest sich
  als fehlgeschlagener Download.
- **Ungepagt, gedeckelt bei 20.000 Zeilen.** Darüber sagt die Antwort das und nennt
  die Zahl, statt zu kürzen — ein kurzer Export, der sich für vollständig ausgibt,
  ist das eine Ergebnis, das man ablehnen muss.
- **`exportLookups` liegt in `lib/cmdb.ts`, nicht in `cmdb-api.ts`.** Letzteres
  importiert den Request-Guard und damit `next/navigation`, also React' Client-Build;
  die DB-Suite läuft unter `--conditions=react-server` und kann es nicht laden.

### Zwei Defekte in der Spaltenerkennung

Beide waren still, beide meldeten Erfolg.

**`Seriennummer` wurde als Fremdnummer erkannt.** Die Muster sind Teilstrings und
standen in der falschen Reihenfolge: `nummer$` traf, bevor das Serien-Muster
erreicht war. Eine Datei mit `Fremdnummer` **und** `Seriennummer` legte den
Aufkleber richtig ab und verwarf danach **jede Seriennummer** — die zweite Spalte
löste ebenfalls auf `asset_tag` auf, fand es belegt und wurde „nicht importieren".
Jetzt steht jedes Muster, das ein bestimmtes Feld benennt, über den beiden auf
`nummer`.

**OTRS ITSM hat zwei Statusachsen.** `Verwendungsstatus` / `DeplState` ist die,
die MITS' `status` meint. `Vorfallstatus` / `InciState` wird zur **Eigenschaft** —
zusammengelegt wäre „produktiv mit offenem Vorfall" nicht rekonstruierbar, und
weggeworfen wäre die Information weg. Entschieden wird das vor der Ratetabelle,
weil `vorfallstatus` den Teilstring `status` enthält: sonst beansprucht die zuerst
gelesene der beiden Spalten das Feld und die andere fällt weg.

Dazu die OTRS-Werte in `coerceCIStatus`: `Wartung` → `repair`, `Pilot` und
`Test/QS` → `active` (jemand benutzt das Gerät), `Planung` → `stock`. Die
ITSM-Klasse `Location` → `other`: ein Standort ist hier eine Zeile in
`mits_location` und kein Inventarobjekt.

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

## Benannte API-Keys und der Ticket-Webhook

`mits_api_key` (`lib/api-keys.ts`), Maske unter `/admin/settings/api-keys`. Ein
Key je aufrufendem System statt eines geteilten Tokens — die Frage, die ein
Admin tatsächlich hat, ist „welches System ruft hier noch an", und ein Geheimnis,
das Monitoring, Inventarskript und eine halb vergessene Integration teilen, kann
sie nicht beantworten und lässt sich nicht einzeln zurückziehen.

- **Format `mits_live_<32 Zeichen base64url>`**, gespeichert wird nur der
  SHA-256. Angezeigt genau einmal, direkt nach dem Anlegen. `key_prefix` ist der
  Griff für die Tabelle und für sich genommen nutzlos.
- **Nachgeschlagen wird über den Hash**, nicht verglichen — es gibt also keinen
  Geheimnis-gegen-Geheimnis-Vergleich, dessen Dauer ein Präfix verraten könnte.
- **`last_used_at` bei jedem angenommenen Aufruf.** Ein Schreibvorgang pro
  Request auf eine Tabelle mit einer Handvoll Zeilen, und das Einzige, was
  „welchen dieser sechs kann ich löschen" beantwortbar macht.
- **Der alte `X-MITS-API-Token` bleibt gültig.** Er ist auf laufenden Instanzen
  konfiguriert; ihn fallen zu lassen hieße, sie beim Update abzuschalten.
  `guardCMDBRequest` prüft Bearer zuerst, dann den Header, dann die Sitzung.

**`POST /api/v1/tickets`** legt ein Ticket aus einer Maschine an — Titel,
Beschreibung, Priorität, `reporterEmail`, `assetSerialNumber`.

- **Nur Bearer bzw. der alte Token, keine Sitzung.** Der Endpunkt schreibt nur;
  es gibt keinen Grund, ihn im Browser zu öffnen.
- **`reporterEmail` wird nachgeschlagen, nie angelegt.** Unbekannt heißt: unter
  dem Auffang-Konto des Mail-Ingests, mit der Adresse als Melder — dieselbe
  Situation wie eine Mail von einem Fremden, deshalb dieselbe Einstellung.
- **Die Priorität wird nach dem Insert gesetzt.** `createTicket` klemmt den
  Entwurf einer melderseitigen Anfrage auf `medium`; diese Regel bleibt, und ein
  Alarm ist kein Melder — also ein zweiter, protokollierter Schritt, wie beim
  Defender-Vorfall im Ingest.
- **Eine Seriennummer, die nichts trifft, ist kein Fehler.** Sie wird gemeldet
  (`asset_matched`), aber das Ticket entsteht trotzdem: einen Alarm wegzuwerfen,
  um die CMDB sauber zu halten, wäre die falsche Reihenfolge.
