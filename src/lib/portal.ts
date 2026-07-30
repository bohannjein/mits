import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_PORTAL_CONFIG,
  DEFAULT_PORTAL_FAQS,
  PortalConfigSchema,
  PortalContentSchema,
  PortalFaqSchema,
  PortalMaintenanceSchema,
  PortalServiceSchema,
  isSafeResourceHref,
  type PortalConfig,
  type PortalContent,
  type PortalFaq,
  type PortalMaintenance,
  type PortalService,
} from "@/types/mits";
import { z } from "zod";

/* ──────────────────────────────────────────────────────────────────────────
   Portal content and layout.

   Everything here is a short, admin-edited list read on nearly every page, so
   each one is a JSON blob in `mits_setting` rather than a table of its own — the
   same reasoning that keeps the announcements out of a table.

   Four separate keys instead of one big blob: every editor in /admin/portal
   saves independently, so two admins working in two tabs cannot overwrite each
   other's unrelated section.
   ────────────────────────────────────────────────────────────────────────── */

const PORTAL_KEY = "portal";
const CONFIG_KEY = "portal_config";
const FAQ_KEY = "portal_faqs";
const STATUS_KEY = "portal_status";
const MAINTENANCE_KEY = "portal_maintenance";

/** Raw setting row, or undefined when the key was never written. */
function readSetting(key: string): unknown {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? safeJsonParse(row.value) : undefined;
}

function writeSetting(key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(value));
}

const EMPTY: PortalContent = { announcements: [], resources: [] };

export function getPortalContent(): PortalContent {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(PORTAL_KEY) as { value: string } | undefined;

  if (!row) return EMPTY;

  const parsed = PortalContentSchema.safeParse(safeJsonParse(row.value));
  if (!parsed.success) return EMPTY;

  // Re-check every link on read, not only on write: a row edited by hand — or
  // written by an older build — must not be able to inject a javascript: target.
  return {
    announcements: parsed.data.announcements,
    resources: parsed.data.resources.filter((resource) =>
      isSafeResourceHref(resource.href),
    ),
  };
}

/** Announcements the portal should actually show. */
export function getActiveAnnouncements(): PortalContent["announcements"] {
  return getPortalContent().announcements.filter(
    (announcement) => announcement.active,
  );
}

export function setPortalContent(next: PortalContent): PortalContent {
  const content = PortalContentSchema.parse({
    announcements: next.announcements,
    resources: next.resources.filter((resource) =>
      isSafeResourceHref(resource.href),
    ),
  });

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(PORTAL_KEY, JSON.stringify(content));

  return content;
}

/* ── Layout configuration ───────────────────────────────────────────────── */

/**
 * Widget visibility, order and every portal label.
 *
 * Parsing an empty object yields the full default set, so a missing key and a
 * partially written one take the same path.
 */
export function getPortalConfig(): PortalConfig {
  const parsed = PortalConfigSchema.safeParse(readSetting(CONFIG_KEY) ?? {});
  return parsed.success ? parsed.data : DEFAULT_PORTAL_CONFIG;
}

export function setPortalConfig(next: PortalConfig): PortalConfig {
  const config = PortalConfigSchema.parse(next);
  writeSetting(CONFIG_KEY, config);
  return config;
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

const FaqListSchema = z.array(PortalFaqSchema);

/**
 * The self-help entries, ordered.
 *
 * The defaults are a *lazy* fallback, not a database seed: they apply only while
 * the key has never been written. An admin who deletes every entry stores `[]` —
 * present but empty — and keeps it. A seeding migration could not tell those two
 * states apart and would keep resurrecting the defaults.
 */
export function getPortalFaqs(): PortalFaq[] {
  const raw = readSetting(FAQ_KEY);
  if (raw === undefined) return DEFAULT_PORTAL_FAQS;

  const parsed = FaqListSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_PORTAL_FAQS;

  return [...parsed.data].sort((a, b) => a.order_index - b.order_index);
}

export function setPortalFaqs(next: PortalFaq[]): PortalFaq[] {
  // The position in the submitted list is the order — rewriting the index here
  // means the editor never has to keep it consistent while rows move.
  const faqs = FaqListSchema.parse(
    next.map((faq, index) => ({ ...faq, order_index: index })),
  );
  writeSetting(FAQ_KEY, faqs);
  return faqs;
}

/* ── Service status ─────────────────────────────────────────────────────── */

const ServiceListSchema = z.array(PortalServiceSchema);

export function getPortalServices(): PortalService[] {
  const parsed = ServiceListSchema.safeParse(readSetting(STATUS_KEY) ?? []);
  return parsed.success ? parsed.data : [];
}

export function setPortalServices(next: PortalService[]): PortalService[] {
  const services = ServiceListSchema.parse(next);
  writeSetting(STATUS_KEY, services);
  return services;
}

/* ── Planned maintenance ────────────────────────────────────────────────── */

const MaintenanceListSchema = z.array(PortalMaintenanceSchema);

export function getMaintenanceNotices(): PortalMaintenance[] {
  const parsed = MaintenanceListSchema.safeParse(
    readSetting(MAINTENANCE_KEY) ?? [],
  );
  return parsed.success ? parsed.data : [];
}

/** Only what the portal should show — same contract as `getActiveAnnouncements`. */
export function getActiveMaintenanceNotices(): PortalMaintenance[] {
  return getMaintenanceNotices().filter((notice) => notice.active);
}

export function setMaintenanceNotices(
  next: PortalMaintenance[],
): PortalMaintenance[] {
  const notices = MaintenanceListSchema.parse(next);
  writeSetting(MAINTENANCE_KEY, notices);
  return notices;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
