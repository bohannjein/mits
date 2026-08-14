import "server-only";

import { getAnalyticsSettings } from "@/lib/analytics/settings";
import { listApiKeys } from "@/lib/api-keys";
import { listCannedResponses } from "@/lib/canned-responses";
import { cmdbCounts } from "@/lib/cmdb";
import { getDataSettings } from "@/lib/data-settings";
import { getFeatureFlags } from "@/lib/features";
import { listFormSchemas } from "@/lib/form-schemas";
import { listLocations } from "@/lib/locations";
import { listMacros } from "@/lib/macros";
import { getNotificationSettings } from "@/lib/notification-settings";
import { listOrganizations } from "@/lib/organizations";
import { getPortalConfig, getPortalFaqs } from "@/lib/portal";
import { getRoleVisibility } from "@/lib/role-visibility";
import { getAuthSettings } from "@/lib/settings";
import { getEffectiveSmtpSettings } from "@/lib/smtp";
import { collectSystemStatus, type StatusTone } from "@/lib/system-status";
import { getTicketDisplaySettings } from "@/lib/ticket-display";
import { listCategories } from "@/lib/ticket-categories";
import { listTriageRules } from "@/lib/triage-rules";
import { countAuthEvents } from "@/lib/auth-log";
import { countAdmins, listUsers } from "@/lib/users";
import { getWorkflowSettings } from "@/lib/workflow-settings";
import { canViewBoard } from "@/lib/auth/roles";
import {
  FEATURE_FLAG_META,
  RESTRICTABLE_ROLES,
  SESSION_LIFETIME_LABELS,
  TICKET_FORM_DISPLAY_META,
  isSmtpConfigured,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die Zeile unter jedem Eintrag des Admin-Desks.

   Der Desk war eine umbrechende Reihe aus achtundzwanzig gleich aussehenden
   Pillen. Das Suchfeld darüber hilft, *wenn man das Wort kennt* — für „was gibt
   es hier überhaupt" und „was ist auf dieser Instanz eingerichtet" tat es
   nichts. Eine frische Installation und eine seit zwei Jahren gepflegte sahen
   identisch aus.

   Das Vorbild ist die Einstellungen-App eines Telefons: Gruppen, und unter jedem
   Eintrag eine Zeile mit dem *aktuellen Wert*. „WLAN — Büro-Netz" statt „WLAN".
   Diese Datei ist diese Zeile.

   **Sieben davon gab es schon.** `collectSystemStatus()` beantwortet Mailversand,
   Postfach, Speicher, KI, Zeit und Schnittstellen — inklusive der Unterscheidung,
   die den Wert ausmacht: *abgeschaltet* ist neutral, *eingeschaltet und
   unvollständig* ist der Zustand, der etwas kaputt macht. Die Zeilen werden
   übernommen statt nachgebaut; zwei Antworten auf „ist SMTP eingerichtet" wären
   eine zu viel.

   **Kosten:** rund fünfundzwanzig indizierte Reads pro Aufruf des Desks.
   better-sqlite3 ist synchron, das blockiert also die Event-Loop — auf einer
   Admin-Seite, die ein Mensch selten und einzeln öffnet, ist das der richtige
   Tausch gegen eine Liste, die nichts über die Instanz sagt.
   ────────────────────────────────────────────────────────────────────────── */

export interface AdminSummary {
  /** Eine Zeile: der aktuelle Wert, nicht die Erklärung der Einstellung. */
  text: string;
  tone: StatusTone;
}

export interface SetupStep {
  key: string;
  label: string;
  /** Warum das zuerst kommt — die Abhängigkeit, nicht die Beschreibung. */
  why: string;
  href: string;
  done: boolean;
}

/* ──────────────────────────────────────────────────────────────────────────
   Erste Schritte.

   Eine frische Instanz hat achtundzwanzig Einträge und keinen Weg hindurch,
   obwohl es Abhängigkeiten gibt: ohne Kategorien filtert die Queue nichts und
   Smart-Routing hat kein Ziel, ohne Mailversand erfährt kein Melder etwas, und
   ein einziges Administrationskonto ist eine Instanz, die sich mit einem
   vergessenen Passwort selbst aussperrt.

   **Kein Wizard.** Eine Liste mit Haken, die echten Zustand liest und
   verschwindet, wenn sie durch ist. Ein Assistent, der einmal durchläuft und
   danach nie wieder erscheint, hilft genau der Person nicht, die ihn ein Jahr
   später bräuchte — und er sperrt die Reihenfolge zu, die hier nur ein
   Vorschlag ist.

   Fünf Schritte, und jeder hat eine Folge, die man ohne ihn *merkt*. Ein
   sechster für etwas, das bloß nett wäre, macht aus der Liste eine Aufgabe.
   ────────────────────────────────────────────────────────────────────────── */

export function collectSetupSteps(): SetupStep[] {
  const smtp = getEffectiveSmtpSettings();

  return [
    {
      key: "second-admin",
      label: "Ein zweites Administrationskonto",
      why: "Der letzte Administrator kann nicht herabgestuft werden — und ein vergessenes Passwort sperrt die Instanz aus.",
      href: "/admin/staff",
      done: countAdmins() > 1,
    },
    {
      key: "categories",
      label: "Kategorien anlegen",
      why: "Ohne sie filtert die Queue nichts, und Smart-Routing hat kein Ziel zum Einsortieren.",
      href: "/admin/categories",
      done: listCategories().length > 0,
    },
    {
      key: "smtp",
      label: "Mailversand einrichten",
      why: "Ohne ihn erfährt ein Melder nichts von einer Antwort, und Erinnerungen gehen nirgends hin.",
      href: "/admin/settings/email",
      done: isSmtpConfigured(smtp),
    },
    {
      key: "locations",
      label: "Standorte pflegen",
      why: "Ein Ticket ohne Ort ist eines, bei dem jemand zurückfragen muss, wo das Gerät steht.",
      href: "/admin/locations",
      done: listLocations().some((site) => site.active),
    },
    {
      key: "faq",
      label: "Ein paar Selbsthilfe-Artikel",
      why: "Sie werden beim Erstellen vorgeschlagen — das ist der einzige Weg, auf dem ein Ticket gar nicht erst entsteht.",
      href: "/admin/faq",
      done: getPortalFaqs().length > 0,
    },
  ];
}

/** `3 Kategorien` / `Keine` — Zähler mit ehrlicher Null. */
function counted(n: number, one: string, many: string, none: string): AdminSummary {
  if (n === 0) return { text: none, tone: "off" };
  return { text: `${n} ${n === 1 ? one : many}`, tone: "ok" };
}

export function collectAdminSummaries(): Record<string, AdminSummary> {
  const summaries: Record<string, AdminSummary> = {};

  /*
   * Erst die Systemzeilen, damit die Fälle darunter sie nicht versehentlich
   * überschreiben. Sie tragen `href` schon auf die Seite, an der sie gepflegt
   * werden — genau der Schlüssel, den diese Map braucht.
   */
  for (const row of collectSystemStatus()) {
    if (!row.href) continue;
    summaries[row.href] = { text: `${row.state} — ${row.detail}`, tone: row.tone };
  }

  const flags = getFeatureFlags();
  const onCount = Object.keys(FEATURE_FLAG_META).filter(
    (key) => flags[key as keyof typeof flags],
  ).length;
  summaries["/admin/settings/features"] = {
    text: `${onCount} von ${Object.keys(FEATURE_FLAG_META).length} Modulen an`,
    tone: "ok",
  };

  const auth = getAuthSettings();
  summaries["/admin/settings/registration"] = {
    text: [
      auth.registrationEnabled ? "Selbstregistrierung offen" : "Selbstregistrierung aus",
      auth.allowedEmailDomains.length > 0
        ? `${auth.allowedEmailDomains.length} Domain(s)`
        : "alle Domains",
      SESSION_LIFETIME_LABELS[auth.sessionLifetimeDays].toLowerCase(),
      auth.twoFactorRequiredRoles.length > 0
        ? `2FA Pflicht für ${auth.twoFactorRequiredRoles.length} Rolle(n)`
        : "2FA freiwillig",
    ].join(" · "),
    // Warn, weil eine offene Registrierung ohne Domain-Grenze heißt: jede
    // Adresse auf der Welt darf sich ein Konto anlegen. Kein Fehler, aber die
    // eine Kombination hier, die jemand meist nicht so gemeint hat.
    tone:
      auth.registrationEnabled && auth.allowedEmailDomains.length === 0
        ? "warn"
        : "ok",
  };

  const users = listUsers();
  const staff = users.filter((user) => canViewBoard(user.role)).length;
  summaries["/admin/staff"] = {
    text: `${staff} mit Zugriff, davon ${countAdmins()} Administration`,
    // Ein einziger Admin ist die Instanz, die sich mit einem vergessenen
    // Passwort selbst aussperrt.
    tone: countAdmins() <= 1 ? "warn" : "ok",
  };
  summaries["/admin/customers"] = counted(
    users.length - staff,
    "Anwender",
    "Anwender",
    "Keine Anwender",
  );

  const visibility = getRoleVisibility();
  const taken = RESTRICTABLE_ROLES.reduce(
    (sum, role) =>
      sum +
      visibility[role].hidden_forms.length +
      visibility[role].hidden_areas.length,
    0,
  );
  summaries["/admin/settings/roles"] = taken === 0
    ? { text: "Jede Rolle sieht alles", tone: "ok" }
    : { text: `${taken} Einschränkung(en)`, tone: "ok" };

  summaries["/admin/security"] = counted(
    countAuthEvents(),
    "Eintrag",
    "Einträge",
    "Noch nichts protokolliert",
  );

  /* ── Ticketablauf ── */

  const workflow = getWorkflowSettings();
  const deadlines = [
    workflow.waitingReminderDays > 0
      ? `Erinnerung nach ${workflow.waitingReminderDays} T.`
      : null,
    workflow.waitingCloseDays > 0
      ? `schließt ${workflow.waitingCloseDays} T. danach`
      : null,
  ].filter(Boolean);
  summaries["/admin/settings/workflow"] = {
    text: [
      workflow.claimOnReply ? "Antwort übernimmt" : "Zuweisung manuell",
      deadlines.length > 0 ? deadlines.join(", ") : "kein automatisches Schließen",
    ].join(" · "),
    tone: "ok",
  };

  const display = getTicketDisplaySettings();
  summaries["/admin/settings/tickets"] = {
    text: `Antworten ${TICKET_FORM_DISPLAY_META[display.formDisplay].label.toLowerCase()}`,
    tone: "ok",
  };

  const categories = listCategories();
  summaries["/admin/categories"] = counted(
    categories.length,
    "Kategorie",
    "Kategorien",
    "Keine Kategorien — der Queue-Filter bleibt leer",
  );
  if (categories.length === 0) summaries["/admin/categories"].tone = "warn";

  /*
   * Regeln, und die eine Kombination, die Arbeit verschluckt.
   *
   * „Abgeschaltet ist neutral" gilt für ein Modul, das niemand angefasst hat.
   * Hier ist der Fall spiegelbildlich: jemand hat Stichworte, Kategorien und
   * Formularvorschläge eingetragen, und der Schalter zwei Einträge weiter oben
   * lässt davon nichts wirken. Der Desk sagte dazu „3 Regeln" — also genau das,
   * was jemand liest, der sich fragt, warum nichts passiert.
   */
  const rules = listTriageRules();
  summaries["/admin/settings/routing"] =
    rules.length > 0 && !flags.feature_smart_routing
      ? {
          text: `${rules.length} ${rules.length === 1 ? "Regel" : "Regeln"} — Modul abgeschaltet, keine wirkt`,
          tone: "warn",
        }
      : counted(rules.length, "Regel", "Regeln", "Keine Regeln");

  summaries["/admin/canned-responses"] = counted(
    listCannedResponses().length,
    "Baustein",
    "Bausteine",
    "Keine Bausteine",
  );
  summaries["/admin/macros"] = counted(
    listMacros().length,
    "Makro",
    "Makros",
    "Keine Makros",
  );
  summaries["/admin/forms/builder"] = counted(
    listFormSchemas().length,
    "Formular",
    "Formulare",
    "Keine Formulare",
  );

  const locations = listLocations();
  const activeSites = locations.filter((site) => site.active).length;
  summaries["/admin/locations"] = counted(
    activeSites,
    "Standort",
    "Standorte",
    "Keine Standorte",
  );

  /* ── Portal ── */

  const portal = getPortalConfig();
  const widgetsOn = portal.widget_order.filter(
    (key) => portal.enabled_widgets[key],
  ).length;
  summaries["/admin/portal"] = {
    text: `${widgetsOn} Widget(s) auf der Startseite`,
    tone: "ok",
  };
  summaries["/admin/faq"] = counted(
    getPortalFaqs().length,
    "Artikel",
    "Artikel",
    "Keine Artikel",
  );

  /* ── Bestand ── */

  const cmdb = cmdbCounts();
  summaries["/admin/cmdb"] = counted(
    cmdb.total,
    "Objekt",
    "Objekte",
    "Kein Bestand",
  );
  summaries["/admin/organizations"] = counted(
    listOrganizations().length,
    "Firma",
    "Firmen",
    "Keine Firmen",
  );

  /* ── Betrieb ── */

  const analytics = getAnalyticsSettings();
  const widgetKeys = [
    "topCreators",
    "creatorTopics",
    "resolvedPerAgent",
    "resolutionTime",
    "firstResponse",
    "inflowVsResolved",
    "peakHeatmap",
    "distribution",
  ] as const;
  const tilesOn = widgetKeys.filter((key) => analytics[key]).length;
  summaries["/admin/settings/analytics"] = {
    text: `${tilesOn} von ${widgetKeys.length} Kacheln`,
    tone: "ok",
  };

  const notifications = getNotificationSettings();
  summaries["/admin/settings/notifications"] = {
    text: `Sammelmeldung ab ${notifications.digestThreshold}`,
    tone: "ok",
  };

  const data = getDataSettings();
  summaries["/admin/settings/data"] = {
    text: `max. ${data.maxUploadMb} MB je Datei · Aufbewahrung ${data.retentionYears} Jahre`,
    tone: "ok",
  };

  summaries["/admin/settings/api-keys"] = counted(
    listApiKeys().length,
    "Zugang",
    "Zugänge",
    "Keine Zugänge",
  );

  return summaries;
}
