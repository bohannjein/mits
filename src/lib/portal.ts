import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  PortalContentSchema,
  isSafeResourceHref,
  type PortalContent,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Portal content: the announcement banner and the quick-resource tiles.

   Stored as one JSON blob in `mits_setting`. Both lists are short, admin-edited
   and read on nearly every page — a table per list would buy nothing.
   ────────────────────────────────────────────────────────────────────────── */

const PORTAL_KEY = "portal";

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

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
