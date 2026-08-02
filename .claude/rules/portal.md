---
paths:
  - "src/lib/portal.ts"
  - "src/components/dashboard/**"
  - "src/app/customer/page.tsx"
  - "src/app/admin/portal/**"
  - "src/app/admin/faq/**"
---

<!--
  Ausgelagert aus AGENTS.md. Der Inhalt ist unveraendert; was sich geaendert
  hat, ist wann er geladen wird: nur noch, wenn jemand eine der Dateien oben
  anfasst, statt in jeder Sitzung. Die immer geltenden Regeln stehen weiter
  in AGENTS.md.
-->

# portal_config, Widgets, FAQ, Status, Wartung
## Modulares Portal

Die Startseite ist nicht verdrahtet, sondern konfiguriert. `portal_config` in `mits_setting`
bestimmt, welche Widgets es gibt, in welcher Reihenfolge und unter welcher Überschrift;
`page.tsx` baut eine `Record<PortalWidgetKey, ReactNode>` und rendert daraus nur, was
`widget_order.filter(enabled_widgets)` übrig lässt. Eine Instanz anzupassen ist damit eine
Admin-Aufgabe, kein Commit.

| Setting-Key | Inhalt |
|---|---|
| `portal` | Systemmeldungen + Schnellzugriffe (unverändert) |
| `portal_config` | Hero-Texte, `ticket_button_label`, `enabled_widgets`, `widget_titles`, `widget_order` |
| `portal_faqs` | FAQ-Einträge, `order_index` beim Speichern aus der Listenposition neu geschrieben |
| `portal_status` | Dienste + Zustand für das Systemstatus-Widget |
| `portal_maintenance` | Angekündigte Wartungsfenster |

Fünf Keys statt ein Blob, weil jeder Editor eigenständig speichert — zwei Admins in zwei
Tabs überschreiben sich nicht gegenseitig unbeteiligte Abschnitte.

**`hero_title` und `hero_subtitle` kennen `{name}`** (Vorname aus der Session). Ohne
Platzhalter bleibt der Text für alle gleich; für anonyme Besucher löst `{name}` zu nichts auf.

**Ein Widget ohne Inhalt rendert `null`**, auch eingeschaltet — dieselbe Regel wie bei
`ResourceGrid` und `AnnouncementBanner`. Eine frische Instanz zeigt deshalb nur FAQ und
Tickets, nicht vier leere Karten.

### Zwei Zod-4-Fallen, die hier zweimal zugeschlagen haben

`PortalConfigSchema` normalisiert absichtlich statt zu validieren, und das braucht die
richtigen Zod-Bausteine:

- **`z.record(Enum, …)` ist in Zod 4 exhaustiv.** Ein `widget_titles` mit nur einem Key
  scheitert am Parse — und ein gescheiterter Parse verwirft die *ganze* Config, also auch
  Reihenfolge und Schalter. Deshalb `z.partialRecord`.
- **`z.array(Enum)` lehnt ein unbekanntes Element ab**, statt es die Transform verwerfen zu
  lassen. Deshalb ist `widget_order` ein `z.array(z.string())`, das in der Transform gegen
  `PortalWidgetKey` filtert. Sonst nimmt ein in einer späteren Version entfernter
  Widget-Key das komplette Layout mit.

Beide Fälle sind in `scripts/verify-forms.mts` abgedeckt (`npm test`). Sie haben kein
sichtbares Fehlerbild: ein Portal, das still auf Default-Widgets zurückfällt, sieht aus wie
ein Portal, das nie konfiguriert wurde.
