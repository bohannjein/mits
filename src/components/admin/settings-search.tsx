"use client";

import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  BrainIcon,
  BuildingIcon,
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
  SparklesIcon,
  ToggleRightIcon,
  UserPlusIcon,
  UsersIcon,
  WandSparklesIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FEATURE_FLAG_META } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Settings search.

   Twenty destinations in one wrapping row is a wall, and the label on the pill
   is rarely the word someone arrives with: "SMTP" is on the E-Mail page,
   "Aufbewahrung" under Daten, "Bucket" under Dateispeicher. Each entry
   therefore carries the vocabulary of the settings *inside* it, and the filter
   runs over that, not over the label alone.

   Client-side and over a static list: the whole index is twenty rows, so a
   round trip per keystroke would be slower than the filter and would put a
   navigation between someone and the page they are looking for. The pills stay
   plain links, so the page still works before hydration — search is the fast
   path, not the only one.
   ────────────────────────────────────────────────────────────────────────── */

type SettingsEntry = {
  href: string;
  label: string;
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
    href: "/admin/settings/features",
    label: "Module",
    icon: ToggleRightIcon,
    keywords: `funktionen features schalter aktivieren abschalten ${FEATURE_KEYWORDS}`,
  },
  {
    href: "/admin/settings/roles",
    label: "Sichtbarkeit",
    icon: EyeOffIcon,
    keywords:
      "rollen rechte berechtigung sichtbar ausblenden verstecken formulare katalog bereiche menü navigation benutzer agent einschränken",
  },
  {
    href: "/admin/locations",
    label: "Standorte",
    icon: MapPinIcon,
    keywords: "filiale niederlassung ort code adresse gebäude",
  },
  {
    href: "/admin/categories",
    label: "Kategorien",
    icon: FolderTreeIcon,
    keywords:
      "kategorie unterkategorie baum hierarchie einsortieren queue filter kacheln intent hardware software",
  },
  {
    href: "/admin/settings/routing",
    label: "Smart-Routing",
    icon: SparklesIcon,
    keywords:
      "triage regeln stichworte keywords automatisch zuordnen routing falsche queue faq vorschlag notebook drucker",
  },
  {
    href: "/admin/organizations",
    label: "Firmen",
    icon: BuildingIcon,
    keywords: "organisation unternehmen mandant kunde domain zuordnung",
  },
  {
    href: "/admin/cmdb",
    label: "CMDB-Verwaltung",
    icon: ServerIcon,
    keywords:
      "inventar objekte assets bestand lizenzen geräte hardware software import csv beziehungen kategorien",
  },
  {
    href: "/admin/canned-responses",
    label: "Textbausteine",
    icon: MessageSquareTextIcon,
    keywords: "vorlagen antworten canned platzhalter template anrede",
  },
  {
    href: "/admin/macros",
    label: "Makros",
    icon: ZapIcon,
    keywords: "aktion status priorität zuweisung textbaustein automatik",
  },
  {
    href: "/admin/settings/storage",
    label: "Dateispeicher",
    icon: HardDriveIcon,
    keywords:
      "s3 bucket endpunkt region access key secret präfix minio anhänge uploads platte objektspeicher",
  },
  {
    href: "/admin/settings/analytics",
    label: "Statistiken",
    icon: BarChart3Icon,
    keywords:
      "analytics kennzahlen widgets diagramme intervall zeitraum heatmap csv auswertung",
  },
  {
    href: "/admin/settings/notifications",
    label: "Benachrichtigungen",
    icon: BellIcon,
    keywords:
      "toast einblendung ecke anzeigedauer abfrageintervall sammelmeldung kanäle live",
  },
  {
    href: "/admin/settings/tickets",
    label: "Ticket-Darstellung",
    icon: LayoutPanelLeftIcon,
    keywords:
      "formularantworten angaben verlauf chat panel bubble anordnung darstellung",
  },
  {
    href: "/admin/settings/email",
    label: "E-Mail",
    icon: MailIcon,
    keywords:
      "smtp host port tls benutzer passwort absenderadresse versand test-mail öffentliche adresse",
  },
  {
    href: "/admin/settings/ai",
    label: "KI-Einstellungen",
    icon: BrainIcon,
    keywords:
      "ki ai ollama anbieter basis-url api-schlüssel textmodell vision-modell triage ocr openai",
  },
  {
    href: "/admin/portal",
    label: "Portal-Inhalte",
    icon: MegaphoneIcon,
    keywords:
      "begrüßung texte schnellzugriffe banner widgets geplante wartung systemstatus systemmeldungen startseite",
  },
  {
    href: "/admin/settings/data",
    label: "Daten & Aufbewahrung",
    icon: DatabaseIcon,
    keywords:
      "retention aufbewahrung anhanggröße grenzen bestand löschen purge datenschutz",
  },
  {
    href: "/admin/mail",
    label: "Mail & Automation",
    icon: ShieldAlertIcon,
    keywords:
      "imap graph postfach abruf tenant client secret support-adresse bereitschaft defender regel eingang",
  },
  {
    href: "/admin/staff",
    label: "Agenten & Administration",
    icon: HeadsetIcon,
    keywords: "benutzer konten rollen admin agent techniker mitarbeiter team",
  },
  {
    href: "/admin/customers",
    label: "Anwender",
    icon: UsersIcon,
    keywords: "kunden melder benutzer konten endanwender",
  },
  {
    href: "/admin/status",
    label: "Systemzustand",
    icon: ActivityIcon,
    keywords:
      "status diagnose probleme fehler live verbindung datenbank erreichbar übersicht systeme health",
  },
  {
    href: "/admin/settings/api-keys",
    label: "API-Keys",
    icon: KeyRoundIcon,
    keywords:
      "rest schnittstelle token bearer webhook monitoring zabbix automatisierung integration inbound",
  },
  {
    href: "/admin/settings/system",
    label: "System & Zeit",
    icon: ClockIcon,
    keywords: "zeitzone ntp zeitserver intervall uhrzeit synchronisation",
  },
  {
    href: "/admin/faq",
    label: "Selbsthilfe / FAQ",
    icon: BookOpenIcon,
    keywords: "hilfe artikel wissensdatenbank fragen anleitung",
  },
  {
    href: "/admin/forms/builder",
    label: "Formular-Builder",
    icon: WandSparklesIcon,
    keywords:
      "schema felder ticket-typ canvas checkliste json bedingte sichtbarkeit abhängige dropdown inspektor",
  },
  {
    href: "/admin#registrierung",
    label: "Registrierung",
    icon: UserPlusIcon,
    keywords:
      "selbstregistrierung anmeldung neue konten domain whitelist erlaubte domains",
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

export function SettingsSearch() {
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

  return (
    <form
      role="search"
      onSubmit={(event) => {
        // Enter goes to the best match. Typing "smtp" and hitting Enter is the
        // whole point; without this the field narrows a list nobody clicked.
        event.preventDefault();
        const first = matches[0];
        if (first) router.push(first.href);
      }}
      className="grid gap-4"
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

      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Einstellung passt zu „{query}“.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {matches.map((entry) => (
            <Button
              key={entry.href}
              asChild
              size="sm"
              className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              <Link href={entry.href}>
                <entry.icon strokeWidth={1.5} />
                {entry.label}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </form>
  );
}
