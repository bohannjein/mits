import "server-only";

import { listApiKeys } from "@/lib/api-keys";
import { getApiToken } from "@/lib/api-tokens";
import { getAISettings } from "@/lib/ai-settings";
import { db } from "@/lib/db/sqlite";
import { getFeatureFlags } from "@/lib/features";
import { getMailSettings } from "@/lib/mail-settings";
import { getS3Settings } from "@/lib/services/storage";
import { getEffectiveSmtpSettings } from "@/lib/smtp";
import { getSystemSettings } from "@/lib/system-settings";
import {
  AI_PROVIDER_LABELS,
  isAIModelReady,
  isMailInboundConfigured,
  isS3Configured,
  isSmtpConfigured,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   What this instance's subsystems are doing.

   Built for the one moment anybody asks: something is not working and the
   question is which part. The header used to carry a live dot for that, on
   every page and for every role — a permanent indicator about a thing that is
   fine almost always, in front of people who cannot act on it either way.

   **Configuration state, not reachability.** Nothing here opens a socket. A
   page that dials SMTP, S3, Ollama and an NTP server on every load would take
   as long as the slowest of them and would time out precisely when the
   instance is already in trouble. The tests that do reach out live on each
   subsystem's own page, behind a button — this page links there.

   **A switched-off module is not a fault.** Off is neutral; the amber state is
   reserved for the combination that actually breaks something: switched on and
   not configured. That distinction is the whole value of the list.
   ────────────────────────────────────────────────────────────────────────── */

export type StatusTone = "ok" | "warn" | "off";

export interface SystemStatusRow {
  key: string;
  label: string;
  tone: StatusTone;
  /** Two or three words: the state itself. */
  state: string;
  /** One line: what that means here, or what is missing. */
  detail: string;
  /** Where it is configured, when there is such a place. */
  href?: string;
}

export function collectSystemStatus(): SystemStatusRow[] {
  const flags = getFeatureFlags();
  const rows: SystemStatusRow[] = [];

  /*
   * The database, by asking it something. `SELECT 1` would prove the handle is
   * open; counting the schema proves it can actually read, which is the failure
   * mode a restored or half-migrated file produces.
   */
  try {
    const tables = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number };
    rows.push({
      key: "database",
      label: "Datenbank",
      tone: "ok",
      state: "Erreichbar",
      detail: `${tables.n} Tabellen.`,
    });
  } catch (error) {
    rows.push({
      key: "database",
      label: "Datenbank",
      tone: "warn",
      state: "Fehler",
      detail: error instanceof Error ? error.message : "Unbekannter Fehler.",
    });
  }

  const smtp = getEffectiveSmtpSettings();
  const smtpReady = isSmtpConfigured(smtp);
  rows.push({
    key: "smtp",
    label: "Mailversand",
    tone: smtpReady ? "ok" : flags.feature_email_notifications ? "warn" : "off",
    state: smtpReady ? "Konfiguriert" : "Nicht konfiguriert",
    detail: smtpReady
      ? `${smtp.host}, Absender ${smtp.from}.`
      : flags.feature_email_notifications
        ? "Benachrichtigungen sind an, es geht aber nichts raus."
        : "Kein Versand eingerichtet.",
    href: "/admin/settings/email",
  });

  const mail = getMailSettings();
  const inboundReady = isMailInboundConfigured(mail);
  rows.push({
    key: "mail-inbound",
    label: "Postfach-Abruf",
    tone: !flags.feature_mail_inbound ? "off" : inboundReady ? "ok" : "warn",
    state: !flags.feature_mail_inbound
      ? "Abgeschaltet"
      : inboundReady
        ? "Konfiguriert"
        : "Unvollständig",
    detail: !flags.feature_mail_inbound
      ? "Das Modul ist aus."
      : inboundReady
        ? `${mail.transport === "graph" ? "Microsoft Graph" : "IMAP"}. Abgerufen wird nur, wenn ein Job von außen POST /api/mail/poll aufruft.`
        : "Es fehlt eine Angabe — ohne Auffang-Konto wird nichts angelegt.",
    href: "/admin/mail",
  });

  const s3 = getS3Settings();
  const s3Ready = isS3Configured(s3);
  rows.push({
    key: "storage",
    label: "Dateispeicher",
    tone: !flags.feature_s3_storage ? "ok" : s3Ready ? "ok" : "warn",
    state: flags.feature_s3_storage && s3Ready ? "S3" : "Platte",
    detail:
      flags.feature_s3_storage && s3Ready
        ? `${s3.bucket} auf ${s3.endpoint}.`
        : flags.feature_s3_storage
          ? "S3 ist an, aber unvollständig — neue Anhänge gehen weiter auf die Platte."
          : "Anhänge liegen im Datenverzeichnis.",
    href: "/admin/settings/storage",
  });

  const ai = getAISettings();
  const aiReady = ai.enabled && isAIModelReady(ai);
  rows.push({
    key: "ai",
    label: "KI-Backend",
    tone: !ai.enabled ? "off" : aiReady ? "ok" : "warn",
    state: !ai.enabled ? "Abgeschaltet" : aiReady ? "Bereit" : "Kein Modell",
    detail: !ai.enabled
      ? "Es wird keine einzige Anfrage an ein Modell gestellt."
      : aiReady
        ? `${AI_PROVIDER_LABELS[ai.provider]}, Textmodell ${ai.textModel}.`
        : "Eingeschaltet, aber ohne Modell antwortet nichts.",
    href: "/admin/settings/ai",
  });

  const system = getSystemSettings();
  rows.push({
    key: "time",
    label: "Zeit",
    tone: "ok",
    state: system.timezone,
    detail: system.ntpHost
      ? `Zeitserver ${system.ntpHost}.`
      : "Kein Zeitserver hinterlegt; es gilt die Uhr des Containers.",
    href: "/admin/settings/system",
  });

  const keys = listApiKeys();
  const legacyToken = getApiToken() !== null;
  const anyKey = keys.length > 0 || legacyToken;
  rows.push({
    key: "api",
    label: "Schnittstellen",
    tone: anyKey ? "ok" : "off",
    state: anyKey ? `${keys.length + (legacyToken ? 1 : 0)} Zugänge` : "Keine",
    detail: anyKey
      ? keys.length > 0
        ? `Zuletzt genutzt: ${describeLastUse(keys)}`
        : "Nur der alte gemeinsame Token."
      : "Ohne Zugang antworten die Endpunkte nur angemeldeten Agenten.",
    href: "/admin/settings/api-keys",
  });

  return rows;
}

/**
 * The newest `last_used_at` across the keys, as a plain sentence.
 *
 * The exact timestamps are on the key page; what this line answers is whether
 * anything out there is still calling at all.
 */
function describeLastUse(keys: { last_used_at: string | null }[]): string {
  const used = keys
    .map((key) => key.last_used_at)
    .filter((value): value is string => value !== null)
    .sort();

  if (used.length === 0) return "noch keiner.";
  return `${used[used.length - 1].slice(0, 10)}.`;
}
