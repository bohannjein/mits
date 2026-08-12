"use client";

import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  BrainIcon,
  BuildingIcon,
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  EyeOffIcon,
  FolderTreeIcon,
  HardDriveIcon,
  HeadsetIcon,
  KeyRoundIcon,
  LayoutPanelLeftIcon,
  MailIcon,
  MapPinIcon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  SearchIcon,
  ServerIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ToggleRightIcon,
  UserPlusIcon,
  UsersIcon,
  WandSparklesIcon,
  WorkflowIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FEATURE_FLAG_META } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Der Admin-Desk als Einstellungsliste.

   Vorher: achtundzwanzig gleich aussehende Pillen in einer umbrechenden Reihe,
   in einer Ordnung, die niemand benennen konnte. Das Suchfeld darüber half,
   *wenn man das Wort kannte* — für „was gibt es hier überhaupt" tat es nichts,
   und eine frische Installation sah aus wie eine seit zwei Jahren gepflegte.

   Das Vorbild ist die Einstellungen-App eines Telefons, und zwar in drei
   Punkten, von denen der letzte der wichtigste ist:

   1. **Gruppen mit Überschrift** statt einer flachen Menge.
   2. **Ganzzeilige Einträge** — Symbol, Beschriftung, Pfeil. Ein Klickziel, das
      so breit ist wie die Liste, statt einer Pille von der Breite ihres Wortes.
   3. **Eine Zeile mit dem aktuellen Wert** unter jeder Beschriftung. „WLAN —
      Büro-Netz", nicht „WLAN". Das ist der Unterschied zwischen einem
      Inhaltsverzeichnis und einer Übersicht, und er kommt aus
      `collectAdminSummaries` auf der Serverseite.

   Die Suche bleibt und filtert über alle Gruppen. Sie sucht weiter über die
   Vokabeln *in* jeder Seite — „SMTP" liegt unter E-Mail, „Bucket" unter
   Dateispeicher —, weil die Beschriftung selten das Wort ist, mit dem jemand
   ankommt.

   **Die Zusammenfassungen kommen als Props, nicht aus einem Fetch.** Diese
   Datei ist eine Client-Komponente, weil die Suche pro Tastendruck filtert; die
   Zustände sind zwanzig Datenbank-Reads und gehören auf den Server. Verbunden
   wird über `href` — die Einträge tragen die Symbole (React-Komponenten
   überleben die Serialisierung nicht), der Server trägt die Werte.
   ────────────────────────────────────────────────────────────────────────── */

type GroupKey =
  | "access"
  | "tickets"
  | "portal"
  | "inventory"
  | "integration"
  | "operations";

const GROUP_LABELS: Record<GroupKey, string> = {
  access: "Zugang & Konten",
  tickets: "Tickets",
  portal: "Portal & Selbsthilfe",
  inventory: "Bestand",
  integration: "Verbindungen",
  operations: "Betrieb",
};

/** Die Reihenfolge der Abschnitte. Häufigstes zuerst, Diagnose zuletzt. */
const GROUP_ORDER: GroupKey[] = [
  "access",
  "tickets",
  "portal",
  "inventory",
  "integration",
  "operations",
];

type SettingsEntry = {
  href: string;
  label: string;
  group: GroupKey;
  icon: LucideIcon;
  /** Words someone might search with. Never shown; matched against. */
  keywords: string;
};

/**
 * The module page owns every feature flag, so its vocabulary is the flag
 * labels themselves — derived rather than copied, or the two lists would drift
 * apart the first time a flag is renamed.
 */
const FEATURE_KEYWORDS = Object.values(FEATURE_FLAG_META)
  .map((entry) => entry.label)
  .join(" ");

const ENTRIES: SettingsEntry[] = [
  {
    href: "/admin/settings/registration",
    label: "Anmeldung & Registrierung",
    group: "access",
    icon: UserPlusIcon,
    keywords:
      "selbstregistrierung anmeldung neue konten domain whitelist erlaubte domains sitzungsdauer angemeldet bleiben zwei-faktor 2fa totp pflicht",
  },
  {
    href: "/admin/staff",
    label: "Agenten & Administration",
    group: "access",
    icon: HeadsetIcon,
    keywords:
      "benutzer konten rollen admin agent techniker mitarbeiter team anlegen neues konto passwort befördern hochstufen",
  },
  {
    href: "/admin/customers",
    label: "Anwender",
    group: "access",
    icon: UsersIcon,
    keywords: "kunden melder benutzer konten endanwender",
  },
  {
    href: "/admin/settings/roles",
    label: "Sichtbarkeit",
    group: "access",
    icon: EyeOffIcon,
    keywords:
      "rollen rechte berechtigung sichtbar ausblenden verstecken formulare katalog bereiche menü navigation benutzer agent einschränken vorschau",
  },
  {
    href: "/admin/security",
    label: "Zugriffsprotokoll",
    group: "access",
    icon: ShieldCheckIcon,
    keywords:
      "anmeldungen login protokoll audit sicherheit zugriff rollenwechsel zwei-faktor 2fa nachweis revision",
  },

  {
    href: "/admin/settings/workflow",
    label: "Ticket-Ablauf",
    group: "tickets",
    icon: WorkflowIcon,
    keywords:
      "zuweisung übernehmen status ballbesitz automatisch schließen erinnerung wartend gelöst frist verfall cron",
  },
  {
    href: "/admin/settings/tickets",
    label: "Ticket-Darstellung",
    group: "tickets",
    icon: LayoutPanelLeftIcon,
    keywords:
      "formularantworten angaben verlauf chat panel bubble anordnung darstellung",
  },
  {
    href: "/admin/categories",
    label: "Kategorien",
    group: "tickets",
    icon: FolderTreeIcon,
    keywords:
      "kategorie unterkategorie baum hierarchie einsortieren queue filter kacheln intent hardware software",
  },
  {
    href: "/admin/settings/routing",
    label: "Smart-Routing",
    group: "tickets",
    icon: SparklesIcon,
    keywords:
      "triage regeln stichworte keywords automatisch zuordnen routing falsche queue faq vorschlag notebook drucker",
  },
  {
    href: "/admin/canned-responses",
    label: "Textbausteine",
    group: "tickets",
    icon: MessageSquareTextIcon,
    keywords: "vorlagen antworten canned platzhalter template anrede",
  },
  {
    href: "/admin/macros",
    label: "Makros",
    group: "tickets",
    icon: ZapIcon,
    keywords: "aktion status priorität zuweisung textbaustein automatik",
  },
  {
    href: "/admin/forms/builder",
    label: "Formular-Builder",
    group: "tickets",
    icon: WandSparklesIcon,
    keywords:
      "schema felder ticket-typ canvas checkliste json bedingte sichtbarkeit abhängige dropdown inspektor",
  },
  {
    href: "/admin/locations",
    label: "Standorte",
    group: "tickets",
    icon: MapPinIcon,
    keywords: "filiale niederlassung ort code adresse gebäude",
  },

  {
    href: "/admin/portal",
    label: "Portal-Inhalte",
    group: "portal",
    icon: MegaphoneIcon,
    keywords:
      "begrüßung texte schnellzugriffe banner widgets geplante wartung systemstatus systemmeldungen startseite",
  },
  {
    href: "/admin/faq",
    label: "Selbsthilfe / FAQ",
    group: "portal",
    icon: BookOpenIcon,
    keywords: "hilfe artikel wissensdatenbank fragen anleitung",
  },

  {
    href: "/admin/cmdb",
    label: "CMDB-Verwaltung",
    group: "inventory",
    icon: ServerIcon,
    keywords:
      "inventar objekte assets bestand lizenzen geräte hardware software import csv beziehungen kategorien",
  },
  {
    href: "/admin/organizations",
    label: "Firmen",
    group: "inventory",
    icon: BuildingIcon,
    keywords: "organisation unternehmen mandant kunde domain zuordnung",
  },

  {
    href: "/admin/settings/email",
    label: "E-Mail",
    group: "integration",
    icon: MailIcon,
    keywords:
      "smtp host port tls benutzer passwort absenderadresse versand test-mail öffentliche adresse",
  },
  {
    href: "/admin/mail",
    label: "Mail & Automation",
    group: "integration",
    icon: ShieldAlertIcon,
    keywords:
      "imap graph postfach abruf tenant client secret support-adresse bereitschaft defender regel eingang",
  },
  {
    href: "/admin/settings/ai",
    label: "KI-Einstellungen",
    group: "integration",
    icon: BrainIcon,
    keywords:
      "ki ai ollama anbieter basis-url api-schlüssel textmodell vision-modell triage ocr openai",
  },
  {
    href: "/admin/settings/storage",
    label: "Dateispeicher",
    group: "integration",
    icon: HardDriveIcon,
    keywords:
      "s3 bucket endpunkt region access key secret präfix minio anhänge uploads platte objektspeicher",
  },
  {
    href: "/admin/settings/api-keys",
    label: "API-Keys",
    group: "integration",
    icon: KeyRoundIcon,
    keywords:
      "rest schnittstelle token bearer webhook monitoring zabbix automatisierung integration inbound",
  },

  {
    href: "/admin/settings/features",
    label: "Module",
    group: "operations",
    icon: ToggleRightIcon,
    keywords: `funktionen features schalter aktivieren abschalten ${FEATURE_KEYWORDS}`,
  },
  {
    href: "/admin/settings/analytics",
    label: "Statistiken",
    group: "operations",
    icon: BarChart3Icon,
    keywords:
      "analytics kennzahlen widgets diagramme intervall zeitraum heatmap csv auswertung",
  },
  {
    href: "/admin/settings/notifications",
    label: "Benachrichtigungen",
    group: "operations",
    icon: BellIcon,
    keywords:
      "toast einblendung ecke anzeigedauer abfrageintervall sammelmeldung kanäle live",
  },
  {
    href: "/admin/settings/data",
    label: "Daten & Aufbewahrung",
    group: "operations",
    icon: DatabaseIcon,
    keywords:
      "retention aufbewahrung anhanggröße grenzen bestand löschen purge datenschutz",
  },
  {
    href: "/admin/settings/system",
    label: "System & Zeit",
    group: "operations",
    icon: ClockIcon,
    keywords: "zeitzone ntp zeitserver intervall uhrzeit synchronisation",
  },
  {
    href: "/admin/status",
    label: "Systemzustand",
    group: "operations",
    icon: ActivityIcon,
    keywords:
      "status diagnose probleme fehler live verbindung datenbank erreichbar übersicht systeme health",
  },
];

/**
 * Fold everything a keyboard produces onto one spelling: case, umlauts and
 * separators. Without it "e-mail" misses a query of "email", and "Anhanggröße"
 * misses "anhanggroesse" — both are what people actually type.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    // NFD splits any remaining accent off its letter; the filter below then
    // drops the mark on its own, so no combining-character range is needed.
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "");
}

const INDEX = ENTRIES.map((entry) => ({
  entry,
  haystack: normalize(`${entry.label} ${entry.keywords}`),
}));

/** Die Farbe des Punkts. Dieselben drei Töne wie in `SystemStatusList`. */
const DOT: Record<string, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  off: "bg-muted-foreground/50",
};

export interface AdminSummaryProp {
  text: string;
  tone: string;
}

function SettingsRow({
  entry,
  summary,
}: {
  entry: SettingsEntry;
  summary?: AdminSummaryProp;
}) {
  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-4 px-4 py-3.5 transition-colors",
        // Der Hintergrund wechselt, der Vordergrund bleibt auf vollem Kontrast —
        // die Hover-Regel. Eine Beschriftung, die unter dem Cursor heller wird,
        // verschwindet genau dann, wenn man sie liest.
        "hover:bg-surface-elevated",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
        <entry.icon className="size-5" strokeWidth={1.5} aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{entry.label}</span>
        {summary && (
          <span className="mt-0.5 flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                DOT[summary.tone] ?? DOT.off,
              )}
            />
            {/* Eine Zeile, gekürzt. Ein umbrechender Zustand macht aus einer
                Liste eine Wand — und die Vollversion steht auf der Seite, die
                die Zeile öffnet. */}
            <span className="truncate text-sm text-muted-foreground">
              {summary.text}
            </span>
          </span>
        )}
      </span>

      <ChevronRightIcon
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden
      />
    </Link>
  );
}

export function AdminSettingsList({
  summaries = {},
}: {
  /** Der aktuelle Wert je Ziel, nach `href`. Vom Server aufgelöst. */
  summaries?: Record<string, AdminSummaryProp>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Every token has to hit, so "mail abruf" narrows instead of widening.
  const tokens = useMemo(
    () => query.split(/\s+/).map(normalize).filter(Boolean),
    [query],
  );

  const matches = useMemo(
    () =>
      tokens.length === 0
        ? ENTRIES
        : INDEX.filter((row) =>
            tokens.every((token) => row.haystack.includes(token)),
          ).map((row) => row.entry),
    [tokens],
  );

  /*
   * Beim Suchen fallen die Überschriften weg.
   *
   * Ein Treffer pro Gruppe ergäbe sechs Überschriften über je einer Zeile — die
   * Gruppierung beantwortet „was gibt es", und wer tippt, hat diese Frage
   * bereits hinter sich.
   */
  const grouped = useMemo(() => {
    if (tokens.length > 0) return null;
    return GROUP_ORDER.map((group) => ({
      group,
      entries: ENTRIES.filter((entry) => entry.group === group),
    })).filter((section) => section.entries.length > 0);
  }, [tokens.length]);

  return (
    <div className="grid gap-6">
      <form
        role="search"
        onSubmit={(event) => {
          // Enter goes to the best match. Typing "smtp" and hitting Enter is the
          // whole point; without this the field narrows a list nobody clicked.
          event.preventDefault();
          const first = matches[0];
          if (first) router.push(first.href);
        }}
      >
        <div className="relative">
          <SearchIcon
            aria-hidden
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Einstellungen durchsuchen"
            placeholder="SMTP, Zeitzone, Aufbewahrung, Bucket …"
            autoComplete="off"
            className="h-11 rounded-full pr-12 pl-11"
          />
          {query.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setQuery("")}
              aria-label="Suche leeren"
              className="absolute top-1/2 right-2 size-8 -translate-y-1/2 rounded-full"
            >
              <XIcon strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </form>

      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Einstellung passt zu „{query}“.
        </p>
      ) : grouped ? (
        grouped.map(({ group, entries }) => (
          <section key={group}>
            <h2 className="label-industrial px-1 pb-2">{GROUP_LABELS[group]}</h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {entries.map((entry) => (
                <SettingsRow
                  key={entry.href}
                  entry={entry}
                  summary={summaries[entry.href]}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {matches.map((entry) => (
            <SettingsRow
              key={entry.href}
              entry={entry}
              summary={summaries[entry.href]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
