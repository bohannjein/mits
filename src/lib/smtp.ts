import "server-only";

import { createTransport, type Transporter } from "nodemailer";

import { db } from "@/lib/db/sqlite";
import { isFeatureEnabled } from "@/lib/features";
import {
  DEFAULT_SMTP_SETTINGS,
  SmtpSettingsSchema,
  isSmtpConfigured,
  resolveSmtpPassword,
  type SmtpSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   SMTP configuration and outbound mail.

   The password lives in `mits_setting` alongside the rest, like the Ollama
   settings. Environment variables are a fallback per field, so a stack can be
   configured either way — but unlike Ollama there is no useful built-in default:
   an unset host means "do not send", not "send somewhere".
   ────────────────────────────────────────────────────────────────────────── */

const SMTP_KEY = "smtp";

function fromEnv(): Partial<SmtpSettings> {
  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  return {
    host: process.env.SMTP_HOST?.trim() || undefined,
    port: Number.isSafeInteger(port) && port > 0 ? port : undefined,
    user: process.env.SMTP_USER?.trim() || undefined,
    password: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM?.trim() || undefined,
    secure: process.env.SMTP_SECURE === "true" ? true : undefined,
    public_url: process.env.MITS_PUBLIC_URL?.trim() || undefined,
  };
}

/** Exactly what is stored. Empty strings where nothing was configured. */
export function getStoredSmtpSettings(): SmtpSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(SMTP_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_SMTP_SETTINGS;

  const parsed = SmtpSettingsSchema.safeParse(safeJsonParse(row.value) ?? {});
  return parsed.success ? parsed.data : DEFAULT_SMTP_SETTINGS;
}

/**
 * What a send should actually use.
 *
 * Per field, database wins over environment — an admin who fixes only the host in
 * the mask keeps the credentials that were already working.
 */
export function getEffectiveSmtpSettings(): SmtpSettings {
  const stored = getStoredSmtpSettings();
  const env = fromEnv();

  return SmtpSettingsSchema.parse({
    host: stored.host.trim() || env.host || "",
    port: stored.host.trim() ? stored.port : (env.port ?? stored.port),
    user: stored.user.trim() || env.user || "",
    password: stored.password || env.password || "",
    from: stored.from.trim() || env.from || "",
    secure: stored.host.trim() ? stored.secure : (env.secure ?? stored.secure),
    public_url: stored.public_url.trim() || env.public_url || "",
  });
}

/** Which fields the effective settings came from — shown in the admin mask. */
export function describeSmtpSource(): { host: "db" | "env"; from: "db" | "env" } {
  const stored = getStoredSmtpSettings();
  const env = fromEnv();
  return {
    host: stored.host.trim() ? "db" : env.host ? "env" : "db",
    from: stored.from.trim() ? "db" : env.from ? "env" : "db",
  };
}

export class SmtpError extends Error {}

/**
 * Persist the mask. `resolveSmtpPassword` decides what happens to a blank
 * password field — see its doc comment; it lives in types/mits.ts so the rule is
 * under test.
 */
export function setSmtpSettings(next: SmtpSettings): SmtpSettings {
  const current = getStoredSmtpSettings();
  const password = resolveSmtpPassword(next.password, current.password);

  const settings = SmtpSettingsSchema.parse({
    host: next.host.trim(),
    port: next.port,
    user: next.user.trim(),
    password,
    from: next.from.trim(),
    secure: next.secure,
    public_url: next.public_url.trim().replace(/\/+$/, ""),
  });

  if (settings.public_url && !/^https?:\/\/.+/i.test(settings.public_url)) {
    throw new SmtpError(
      "Die öffentliche Adresse muss mit http:// oder https:// beginnen.",
    );
  }
  if (settings.from && !settings.from.includes("@")) {
    throw new SmtpError("Die Absenderadresse braucht ein @.");
  }

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SMTP_KEY, JSON.stringify(settings));

  return settings;
}

function transporterFor(settings: SmtpSettings): Transporter {
  return createTransport({
    host: settings.host,
    port: settings.port,
    // Implicit TLS on 465; otherwise nodemailer upgrades via STARTTLS when the
    // server advertises it.
    secure: settings.secure,
    auth: settings.user
      ? { user: settings.user, pass: settings.password }
      : undefined,
    // A dead mail server must not hold a request open.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export interface OutboundMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send, or explain why not.
 *
 * Returns a result instead of throwing: every caller is a side effect of
 * something more important — filing a ticket, posting a reply — and none of them
 * should fail because a mail server is down.
 */
export async function sendMail(
  mail: OutboundMail,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = getEffectiveSmtpSettings();

  if (!isSmtpConfigured(settings)) {
    return { ok: false, reason: "SMTP ist nicht konfiguriert." };
  }

  try {
    await transporterFor(settings).sendMail({
      from: settings.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unbekannter SMTP-Fehler.",
    };
  }
}

/**
 * Fire-and-log: for notifications, where the caller has already committed the
 * thing the mail is about and cannot usefully react to a failure.
 */
export async function sendNotification(mail: OutboundMail): Promise<void> {
  if (!isFeatureEnabled("feature_email_notifications")) return;

  const result = await sendMail(mail);
  if (!result.ok) {
    console.warn(
      `[MITS] Benachrichtigung an ${mail.to} nicht versendet: ${result.reason}`,
    );
  }
}

/**
 * Verify the connection without sending anything.
 *
 * `verify` reaches the greeting and the AUTH exchange, which is where a wrong
 * password or a blocked port shows up — the two things an admin actually gets
 * wrong.
 */
export async function verifySmtp(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const settings = getEffectiveSmtpSettings();

  if (!isSmtpConfigured(settings)) {
    return {
      ok: false,
      reason: "Host und Absenderadresse müssen gesetzt sein.",
    };
  }

  try {
    await transporterFor(settings).verify();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Verbindung fehlgeschlagen.",
    };
  }
}

/**
 * Absolute link to a ticket, for use in mail.
 *
 * Returns null without `public_url`. A mail is composed outside a request, so
 * there is no Host header to derive from — and a relative link in an inbox is
 * useless. The template then omits the button rather than rendering a dead one.
 */
export function ticketUrl(ticketId: string): string | null {
  const base = getEffectiveSmtpSettings().public_url;
  if (!base) return null;
  return `${base}/customer/tickets/${ticketId}`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
