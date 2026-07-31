import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/sqlite";
import {
  MITSOrganizationSchema,
  isWebsiteUrl,
  normaliseWebsite,
  type MITSOrganization,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Organizations.

   Row-at-a-time CRUD, unlike `lib/locations.ts` which replaces the whole list. The
   difference is the number of fields: a branch is four inputs and edits well as a
   table, a company is thirteen and needs a form. Replacing the list would also mean
   a form submission that omits one row deletes it — survivable for a branch code,
   not for a customer record with assets hanging off it.

   No foreign keys out of here. `mits_user_profile.organization_id` and
   `mits_configuration_item.organization_id` may dangle; both resolve to null and
   render as "no company" rather than failing. Same rule as locations.
   ────────────────────────────────────────────────────────────────────────── */

interface OrganizationRow {
  id: string;
  name: string;
  code: string;
  domain: string;
  customer_number: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  phone: string;
  website: string;
  note: string;
  active: number;
}

const COLUMNS = `id, name, code, domain, customer_number, street, postal_code,
                 city, country, phone, website, note, active`;

function rowToOrganization(row: OrganizationRow): MITSOrganization {
  return MITSOrganizationSchema.parse({
    ...row,
    // SQLite has no boolean.
    active: row.active === 1,
  });
}

export class OrganizationError extends Error {}

export function listOrganizations(): MITSOrganization[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM mits_organization ORDER BY name ASC`)
    .all() as OrganizationRow[];
  return rows.map(rowToOrganization);
}

/** The ones a picker may offer. Inactive rows stay resolvable for existing records. */
export function listActiveOrganizations(): MITSOrganization[] {
  return listOrganizations().filter((organization) => organization.active);
}

export function getOrganization(id: string): MITSOrganization | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM mits_organization WHERE id = ?`)
    .get(id) as OrganizationRow | undefined;
  return row ? rowToOrganization(row) : null;
}

export function organizationExists(id: string): boolean {
  const row = db
    .prepare("SELECT 1 AS hit FROM mits_organization WHERE id = ?")
    .get(id) as { hit: number } | undefined;
  return Boolean(row);
}

/**
 * Create or update one company.
 *
 * An empty `id` means create. The name is unique case-insensitively — two rows called
 * "Weller GmbH" are not two customers, they are one customer somebody entered twice,
 * and the second one collects half the assets.
 */
export function saveOrganization(input: MITSOrganization): MITSOrganization {
  const parsed = MITSOrganizationSchema.safeParse({
    ...input,
    id: input.id.trim() || randomUUID(),
  });
  if (!parsed.success) {
    throw new OrganizationError(
      parsed.error.issues[0]?.message ?? "Die Angaben sind unvollständig.",
    );
  }

  const organization = { ...parsed.data, name: parsed.data.name.trim() };

  const clash = db
    .prepare(
      `SELECT id FROM mits_organization
        WHERE lower(trim(name)) = lower(trim(?)) AND id <> ?`,
    )
    .get(organization.name, organization.id) as { id: string } | undefined;
  if (clash) {
    throw new OrganizationError(`Firma bereits vorhanden: ${organization.name}`);
  }

  // Stored without the @, so a pasted "@firma.de" still matches on read.
  organization.domain = organization.domain.trim().replace(/^@/, "").toLowerCase();

  if (organization.website) {
    organization.website = normaliseWebsite(organization.website);
    if (!isWebsiteUrl(organization.website)) {
      throw new OrganizationError(
        "Die Website muss eine http- oder https-Adresse mit Domain sein.",
      );
    }
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mits_organization
       (id, name, code, domain, customer_number, street, postal_code, city,
        country, phone, website, note, active, created_at, updated_at)
     VALUES
       (@id, @name, @code, @domain, @customer_number, @street, @postal_code, @city,
        @country, @phone, @website, @note, @active, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name            = excluded.name,
       code            = excluded.code,
       domain          = excluded.domain,
       customer_number = excluded.customer_number,
       street          = excluded.street,
       postal_code     = excluded.postal_code,
       city            = excluded.city,
       country         = excluded.country,
       phone           = excluded.phone,
       website         = excluded.website,
       note            = excluded.note,
       active          = excluded.active,
       updated_at      = excluded.updated_at`,
  ).run({
    ...organization,
    active: organization.active ? 1 : 0,
    created_at: now,
    updated_at: now,
  });

  return organization;
}

/**
 * Delete a company, but only while nothing points at it.
 *
 * Refusing beats cascading and beats dangling: an admin who wanted the customer gone
 * gets told what still references them, which is the information needed to decide
 * whether the answer is "delete the assets too" or "this was the wrong row". The
 * alternative — deleting and letting the references resolve to null — is a silent loss
 * of the ownership of every asset they had.
 *
 * Deactivating is the usual answer and stays available.
 */
export function deleteOrganization(id: string): void {
  const items = db
    .prepare(
      `SELECT COUNT(*) AS n FROM mits_configuration_item
        WHERE organization_id = ? AND deleted_at IS NULL`,
    )
    .get(id) as { n: number };
  if (items.n > 0) {
    throw new OrganizationError(
      `Noch ${items.n} Objekt(e) dieser Firma zugeordnet. Erst umziehen oder löschen.`,
    );
  }

  const users = db
    .prepare("SELECT COUNT(*) AS n FROM mits_user_profile WHERE organization_id = ?")
    .get(id) as { n: number };
  if (users.n > 0) {
    throw new OrganizationError(
      `Noch ${users.n} Person(en) dieser Firma zugeordnet. Erst umziehen.`,
    );
  }

  db.prepare("DELETE FROM mits_organization WHERE id = ?").run(id);
}

/** Assets and people per company, for the admin table. One query each, not per row. */
export function organizationCounts(): Record<
  string,
  { items: number; users: number }
> {
  const counts: Record<string, { items: number; users: number }> = {};

  const items = db
    .prepare(
      `SELECT organization_id AS id, COUNT(*) AS n
         FROM mits_configuration_item
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id`,
    )
    .all() as { id: string; n: number }[];
  for (const row of items) {
    counts[row.id] = { items: row.n, users: 0 };
  }

  const users = db
    .prepare(
      `SELECT organization_id AS id, COUNT(*) AS n
         FROM mits_user_profile
        WHERE organization_id IS NOT NULL
        GROUP BY organization_id`,
    )
    .all() as { id: string; n: number }[];
  for (const row of users) {
    counts[row.id] = { items: counts[row.id]?.items ?? 0, users: row.n };
  }

  return counts;
}
