import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { db } from "@/lib/db/sqlite";
import { TriageRuleSchema, type TriageRule } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Where the triage rules live.

   A JSON blob in `mits_setting`, like the canned responses and the macros: a
   short admin-edited list, read whole and written whole, with no attributes of
   its own worth joining on. A table would buy per-rule statistics, which nothing
   asks for, at the price of a migration and a second write path.

   No shipped defaults, and that is the same call as for the canned responses:
   a rule invented here would file somebody else's tickets by words this site
   never chose. The settings mask starts empty and says so.

   The matching itself is in `services/auto-triage.ts` — pure, and covered by the
   offline suite. This file only reads and writes.
   ────────────────────────────────────────────────────────────────────────── */

const KEY = "triage_rules";
const ListSchema = z.array(TriageRuleSchema);

export class TriageRuleError extends Error {}

export function listTriageRules(): TriageRule[] {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(KEY) as { value: string } | undefined;

  if (!row) return [];

  const parsed = ListSchema.safeParse(safeJsonParse(row.value));
  if (!parsed.success) return [];

  return [...parsed.data].sort((a, b) => a.order_index - b.order_index);
}

/**
 * Replace the whole list.
 *
 * Keywords are lower-cased and de-duplicated here rather than at match time. The
 * matcher lower-cases too — it has to, it also sees hand-edited rows — but doing
 * it on save is what makes the stored list say what it means: an admin who typed
 * „Drucker" and „drucker" sees one keyword afterwards instead of a list that
 * looks like it has a redundant entry.
 *
 * A rule with no keywords is dropped. It can never match, and a row in the mask
 * that does nothing is worse than an absent one: somebody will assume it works.
 */
export function setTriageRules(next: TriageRule[]): TriageRule[] {
  const cleaned = next.map((rule, index) => ({
    ...rule,
    id: rule.id.trim() || randomUUID(),
    title: rule.title.trim(),
    keywords: [
      ...new Set(
        rule.keywords
          .map((word) => word.trim().toLowerCase())
          .filter((word) => word.length >= 2),
      ),
    ],
    // Position in the submitted list is the order — the same rule the canned
    // responses follow, so the editor never maintains an index while rows move.
    order_index: index,
  }));

  const rules = ListSchema.parse(
    cleaned.filter((rule) => rule.keywords.length > 0 && rule.title !== ""),
  );

  const titles = new Set<string>();
  for (const rule of rules) {
    const key = rule.title.toLowerCase();
    if (titles.has(key)) {
      throw new TriageRuleError(`Regel doppelt benannt: ${rule.title}`);
    }
    titles.add(key);
  }

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, JSON.stringify(rules));

  return rules;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
