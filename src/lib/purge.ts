import "server-only";

import { db } from "@/lib/db/sqlite";
import { removeObject } from "@/lib/services/storage";
import { invalidateAnalytics } from "@/lib/services/analytics-cache";
import type { StorageBackend } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Emptying the instance on purpose.

   Everything else in MITS soft-deletes: `deleted_at` is set, reads filter on it,
   the trash view can bring it back. This is the one path that issues real DELETEs,
   and it exists because a test instance eventually has to be a fresh instance
   again — and because "delete the file and restart" is not available to somebody
   running the container from Portainer.

   Three things this is not:

   - **Not the retention policy.** That one anonymises old closed tickets and keeps
     the work record. This removes rows.
   - **Not reachable from a session alone.** The action in front of it asks for the
     word, the confirmations and the account password; see `purgeDataAction`.
   - **Not a factory reset.** Accounts, settings, form schemas, macros, canned
     responses and FAQ attachments stay. What goes is what an admin selected, and
     each scope is named on screen before it runs.

   **The blobs are removed after the transaction, not inside it.** Deleting an
   object from S3 is a network call: holding a write transaction open across it
   would block every other writer for as long as the bucket takes to answer, and a
   failure there must not roll back a deletion the admin has already confirmed. So
   the keys are collected first, the rows go in one unit of work, and the bytes are
   swept afterwards — an orphaned blob is wasted disk, an orphaned row is a broken
   page.
   ────────────────────────────────────────────────────────────────────────── */

export interface PurgeScopes {
  /** Tickets and everything that only exists because a ticket does. */
  tickets: boolean;
  /** Inventory objects and their relations. */
  cmdb: boolean;
  /** The company list. */
  organizations: boolean;
  /** The site list. */
  locations: boolean;
}

export interface PurgeReport {
  tickets: number;
  comments: number;
  attachments: number;
  items: number;
  relations: number;
  organizations: number;
  locations: number;
  /**
   * Blobs the sweep asked the backend to remove.
   *
   * Attempts, not confirmations: `removeObject` is best effort by design and
   * swallows its own errors, so a count of successes here would be a number that
   * cannot be wrong — which is worse than one that is honest about what it means.
   */
  blobsSwept: number;
}

const EMPTY_REPORT: PurgeReport = {
  tickets: 0,
  comments: 0,
  attachments: 0,
  items: 0,
  relations: 0,
  organizations: 0,
  locations: 0,
  blobsSwept: 0,
};

export const nothingSelected = (scopes: PurgeScopes): boolean =>
  !scopes.tickets && !scopes.cmdb && !scopes.organizations && !scopes.locations;

/**
 * How many rows each scope holds, for the dialog to name before it runs.
 *
 * **Soft-deleted rows counted.** Everywhere else in MITS `deleted_at IS NULL` is
 * the rule; here it would understate what is about to go, and a number that is
 * lower than the truth is the wrong direction for a confirmation dialog.
 */
export function purgeCounts(): Record<keyof PurgeScopes, number> {
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  return {
    tickets: count("mits_ticket"),
    cmdb: count("mits_configuration_item"),
    organizations: count("mits_organization"),
    locations: count("mits_location"),
  };
}

/**
 * Delete the selected scopes. Returns what went.
 *
 * The order inside the transaction is children before parents, because
 * `foreign_keys = ON`: a `DELETE FROM mits_ticket` with comments still pointing at
 * it fails rather than cascading, and it fails in the middle of a wipe an admin has
 * already confirmed.
 */
export async function purgeData(scopes: PurgeScopes): Promise<PurgeReport> {
  if (nothingSelected(scopes)) return { ...EMPTY_REPORT };

  /*
   * Which blobs to sweep, read before the rows are gone.
   *
   * Only uploads bound to a ticket. A FAQ attachment is published content that
   * outlives every ticket, and an upload with no `ticket_id` is one somebody
   * attached to a draft they have not submitted yet — deleting either would be a
   * scope this dialog never offered.
   */
  const blobs = scopes.tickets
    ? (db
        .prepare(
          `SELECT stored_name, storage FROM mits_upload
            WHERE ticket_id IS NOT NULL`,
        )
        .all() as { stored_name: string; storage: StorageBackend | null }[])
    : [];

  const report = db.transaction((): PurgeReport => {
    const counts = { ...EMPTY_REPORT };
    const run = (sql: string): number => db.prepare(sql).run().changes;

    if (scopes.tickets) {
      counts.comments = run("DELETE FROM mits_ticket_comment");
      run("DELETE FROM mits_ticket_link");
      run("DELETE FROM mits_ticket_read");
      run("DELETE FROM mits_ticket_worklog");
      run("DELETE FROM mits_ticket_checklist");
      run("DELETE FROM mits_ticket_ci");
      /*
       * Reminders go with their tickets.
       *
       * Every read of this table joins `mits_ticket`, so leftovers would be
       * invisible rather than broken — which is exactly why they have to be
       * deleted here: an invisible row nobody ever sees again is one nothing will
       * ever clean up. The categories are *not* touched: they are master data like
       * the locations, and this scope is "the ticket stock", not "the filing
       * system it used".
       */
      run("DELETE FROM mits_ticket_reminder");
      // Pins, for the same reason as the reminders above: every read of the table
      // joins the ticket, so a leftover row is invisible rather than broken — and
      // an invisible row is one nothing will ever clean up.
      run("DELETE FROM mits_ticket_pin");
      // The history of the tickets that are going. Nothing in it refers to anything
      // that survives, and a log about rows nobody can open is not a record.
      run("DELETE FROM mits_audit_log");
      counts.attachments = run(
        "DELETE FROM mits_upload WHERE ticket_id IS NOT NULL",
      );
      counts.tickets = run("DELETE FROM mits_ticket");
    }

    if (scopes.cmdb) {
      counts.relations = run("DELETE FROM mits_ci_relation");
      // Also when tickets stay: the pairing points at objects that are about to
      // stop existing, and the ticket keeps its own history either way.
      run("DELETE FROM mits_ticket_ci");
      counts.items = run("DELETE FROM mits_configuration_item");
    }

    if (scopes.organizations) {
      /*
       * The references go before the rows, and they are cleared rather than
       * cascaded: a person and an object that lose their company are still a person
       * and an object. Deleting them along with the company would turn "remove the
       * customer list" into "remove the customers' hardware".
       */
      run("UPDATE mits_user_profile SET organization_id = NULL");
      run("UPDATE mits_configuration_item SET organization_id = NULL");
      counts.organizations = run("DELETE FROM mits_organization");
    }

    if (scopes.locations) {
      run("UPDATE mits_ticket SET location_id = NULL");
      run("UPDATE mits_configuration_item SET location_id = NULL");
      counts.locations = run("DELETE FROM mits_location");
    }

    return counts;
  })();

  for (const blob of blobs) {
    // Reads the backend the *row* named, not the one currently configured: an
    // attachment written before a switch to S3 still has its bytes on disk.
    await removeObject(blob.storage ?? "disk", blob.stored_name);
    report.blobsSwept += 1;
  }

  // The cached metric set is keyed on settings, not on content, so it would keep
  // serving counts for tickets that no longer exist.
  invalidateAnalytics();

  return report;
}
