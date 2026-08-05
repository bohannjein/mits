import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/sqlite";
import {
  CATEGORY_ROOT,
  MITSTicketCategorySchema,
  categoryPathLabel,
  type MITSCategoryNode,
  type MITSTicketCategory,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The category tree.

   A real table rather than a settings blob, unlike the canned responses: tickets
   reference a category by id, so the rows have to be individually addressable and
   have to outlive several edits of the list. Same reasoning as `mits_location`,
   and the same consequence — no foreign key from `mits_ticket.category_id`, so
   deleting a category never deletes a ticket.

   Read whole and shaped in memory. A helpdesk has tens of categories, not
   thousands; a recursive CTE would be the right answer at a scale this will not
   reach, and the wrong one to debug at the scale it will.
   ────────────────────────────────────────────────────────────────────────── */

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string;
  icon: string;
  order_index: number;
}

function rowToCategory(row: CategoryRow): MITSTicketCategory {
  return MITSTicketCategorySchema.parse(row);
}

export class CategoryError extends Error {}

export function listCategories(): MITSTicketCategory[] {
  const rows = db
    .prepare(
      `SELECT id, name, parent_id, icon, order_index
         FROM mits_ticket_category
        ORDER BY order_index ASC, name ASC`,
    )
    .all() as CategoryRow[];

  return rows.map(rowToCategory);
}

/** The roots, each with its children. What both the filter and the editor render. */
export function listCategoryTree(): MITSCategoryNode[] {
  const all = listCategories();

  return all
    .filter((entry) => entry.parent_id === CATEGORY_ROOT)
    .map((root) => ({
      ...root,
      children: all.filter((entry) => entry.parent_id === root.id),
    }));
}

export function getCategory(id: string): MITSTicketCategory | null {
  if (!id) return null;
  const row = db
    .prepare(
      `SELECT id, name, parent_id, icon, order_index
         FROM mits_ticket_category WHERE id = ?`,
    )
    .get(id) as CategoryRow | undefined;
  return row ? rowToCategory(row) : null;
}

/**
 * A category and everything under it.
 *
 * This is what the filter selects on: picking „Hardware" has to return the
 * tickets filed under „Hardware / Notebooks" as well, or the parent level is a
 * dropdown entry that finds nothing on an instance that uses subcategories —
 * which is every instance that has any.
 *
 * Iterative and depth-guarded. A hand-edited row can make a cycle (A's parent is
 * B, B's parent is A), and a recursive walk over one does not return.
 */
export function descendantCategoryIds(id: string): string[] {
  if (!id) return [];

  const all = listCategories();
  const collected = new Set<string>([id]);

  let frontier = [id];
  // Deeper than any real tree, shallower than a hang. A cycle terminates here
  // with a truncated answer rather than with the request never finishing.
  for (let depth = 0; depth < 12 && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const entry of all) {
      if (!frontier.includes(entry.parent_id)) continue;
      if (collected.has(entry.id)) continue;
      collected.add(entry.id);
      next.push(entry.id);
    }
    frontier = next;
  }

  return [...collected];
}

/**
 * The names from the root down to this category.
 *
 * Empty for an unknown id, which is the honest answer for a ticket whose
 * category was deleted — the badge then renders nothing instead of the word
 * „unbekannt", which reads like a value somebody chose.
 */
export function categoryPath(id: string | null): string[] {
  if (!id) return [];

  const byId = new Map(listCategories().map((entry) => [entry.id, entry]));
  const parts: string[] = [];

  let current = byId.get(id);
  for (let depth = 0; current && depth < 12; depth += 1) {
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return parts;
}

/** `Hardware / Notebooks`, or the empty string. */
export function categoryLabel(id: string | null): string {
  return categoryPathLabel(categoryPath(id));
}

/**
 * Whether this id is one a ticket may be filed under.
 *
 * Existence only — a root is a legal filing, because not every branch of the tree
 * has children and forcing a leaf would make „Sonstiges" unusable.
 */
export function isFilableCategory(id: string): boolean {
  return getCategory(id) !== null;
}

/**
 * Replace the whole tree in one transaction.
 *
 * The editor is a list of rows with a parent each, submitted whole, so a
 * diff-based API would only move the bookkeeping into the form — the same call
 * `replaceLocations` makes.
 *
 * Rows absent from `next` are deleted, and their tickets keep a `category_id`
 * that no longer resolves. That is deliberate and it is why `categoryPath`
 * returns an empty list rather than throwing: the alternative is either deleting
 * tickets or refusing to delete a category anybody ever used, and both are worse
 * than a badge that stops showing.
 */
export function replaceCategories(
  next: MITSTicketCategory[],
): MITSTicketCategory[] {
  const parsed = next.map((entry, index) =>
    MITSTicketCategorySchema.parse({
      ...entry,
      id: entry.id.trim() || randomUUID(),
      name: entry.name.trim(),
      order_index: index,
    }),
  );

  const ids = new Set(parsed.map((entry) => entry.id));

  /*
   * A parent has to be a row in this same submission.
   *
   * Checked before anything is written, because the storage layer cannot check it
   * — there is no foreign key, for the reason given at the top of this file. An
   * orphan would be invisible: `listCategoryTree` shows roots and their children,
   * so a category whose parent does not exist simply never renders, and an admin
   * would see their entry disappear on save with no error.
   */
  for (const entry of parsed) {
    if (entry.parent_id === CATEGORY_ROOT) continue;
    if (!ids.has(entry.parent_id)) {
      throw new CategoryError(
        `Oberkategorie fehlt für „${entry.name}“.`,
      );
    }
    if (entry.parent_id === entry.id) {
      throw new CategoryError(`„${entry.name}“ kann sich nicht selbst enthalten.`);
    }
  }

  /*
   * Siblings must not share a name, checked here as well as by the unique index.
   *
   * The index is the guarantee; this is the readable message. A raw
   * `SQLITE_CONSTRAINT_UNIQUE` reaching the admin mask says nothing about which
   * of thirty rows collided.
   */
  const seen = new Set<string>();
  for (const entry of parsed) {
    // A space is a safe separator here and only here: `parent_id` is a UUID or the
    // empty string, so it never contains one, and the name may contain as many as
    // it likes without the two halves becoming ambiguous.
    const key = `${entry.parent_id} ${entry.name.toLowerCase()}`;
    if (seen.has(key)) {
      throw new CategoryError(`Kategorie doppelt vergeben: ${entry.name}`);
    }
    seen.add(key);
  }

  db.transaction(() => {
    const existing = db
      .prepare("SELECT id FROM mits_ticket_category")
      .all() as { id: string }[];

    const remove = db.prepare("DELETE FROM mits_ticket_category WHERE id = ?");
    for (const row of existing) {
      if (!ids.has(row.id)) remove.run(row.id);
    }

    const now = new Date().toISOString();
    const upsert = db.prepare(
      `INSERT INTO mits_ticket_category
         (id, name, parent_id, icon, order_index, created_at, updated_at)
       VALUES (@id, @name, @parent_id, @icon, @order_index, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         name        = excluded.name,
         parent_id   = excluded.parent_id,
         icon        = excluded.icon,
         order_index = excluded.order_index,
         updated_at  = excluded.updated_at`,
    );

    /*
     * Parents before children, so the tree is consistent at every point inside
     * the transaction. Not strictly required without a foreign key — but the day
     * one is added, an insert order that happened to work is the thing that
     * breaks, and the reason will not be obvious.
     */
    const roots = parsed.filter((entry) => entry.parent_id === CATEGORY_ROOT);
    const rest = parsed.filter((entry) => entry.parent_id !== CATEGORY_ROOT);
    for (const entry of [...roots, ...rest]) upsert.run({ ...entry, now });
  })();

  return listCategories();
}

/** Ticket count per category id, for the admin tree. Uncategorised is not counted. */
export function ticketCountsByCategory(): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT category_id AS id, COUNT(*) AS count
         FROM mits_ticket
        WHERE deleted_at IS NULL
          AND category_id IS NOT NULL
        GROUP BY category_id`,
    )
    .all() as { id: string; count: number }[];

  return Object.fromEntries(rows.map((row) => [row.id, row.count]));
}
