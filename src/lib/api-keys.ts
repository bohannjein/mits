import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   Named API keys.

   One key per calling system — the monitoring, an inventory script, a
   provisioning job — instead of the single shared token in `mits_setting`.
   That token stays: it is configured on running instances and documented, and
   turning it off would break the CMDB integrations that use it today. What it
   cannot do is answer "which system is still calling" or be revoked without
   taking the other callers down with it.

   **Only the hash is stored.** A key readable out of the database is a second
   copy of a credential, and showing it exactly once is worth nothing if the row
   holds it too. `key_prefix` is the handle the UI shows instead; it is not
   secret and identifies nothing on its own.

   **The lookup is by hash, not a comparison.** The presented token is hashed
   and used as an index key, so there is no secret-versus-secret compare whose
   duration could leak a prefix — the work is the same whether the first byte
   matches or not.

   **Fail closed.** No matching row means refused, never "unconfigured, so
   allowed". An endpoint that opens itself when it finds no keys is an open door
   on every fresh instance.
   ────────────────────────────────────────────────────────────────────────── */

/** Everything before the random part. Visible, and the reason a leaked key is recognisable. */
export const API_KEY_PREFIX = "mits_live_";

/** Characters of the random part kept beside the hash for the UI. */
const HANDLE_LENGTH = 8;

export interface ApiKeyRow {
  id: string;
  name: string;
  /** `mits_live_1a2b3c4d` — enough to tell two keys apart, not enough to use one. */
  handle: string;
  created_at: string;
  created_by: string;
  last_used_at: string | null;
}

export class ApiKeyError extends Error {}

function hash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function toRow(row: {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  created_by: string;
  last_used_at: string | null;
}): ApiKeyRow {
  return {
    id: row.id,
    name: row.name,
    handle: `${API_KEY_PREFIX}${row.key_prefix}`,
    created_at: row.created_at,
    created_by: row.created_by,
    last_used_at: row.last_used_at,
  };
}

export function listApiKeys(): ApiKeyRow[] {
  const rows = db
    .prepare(
      `SELECT id, name, key_prefix, created_at, created_by, last_used_at
         FROM mits_api_key
        ORDER BY created_at DESC`,
    )
    .all() as Parameters<typeof toRow>[0][];

  return rows.map(toRow);
}

/**
 * A new key. The token is returned once and never again — nothing stores it.
 *
 * 24 random bytes, base64url, so the visible part is 32 characters of roughly
 * 192 bits. Well past guessing, and short enough to paste into a monitoring
 * config without wrapping.
 */
export function createApiKey(
  name: string,
  createdBy: string,
): { token: string; key: ApiKeyRow } {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiKeyError("Ein Name ist nötig.");
  }
  if (trimmed.length > 120) {
    throw new ApiKeyError("Der Name ist zu lang.");
  }

  const secret = randomBytes(24).toString("base64url");
  const token = `${API_KEY_PREFIX}${secret}`;
  const row = {
    id: randomUUID(),
    name: trimmed,
    key_hash: hash(token),
    key_prefix: secret.slice(0, HANDLE_LENGTH),
    created_at: new Date().toISOString(),
    created_by: createdBy,
  };

  db.prepare(
    `INSERT INTO mits_api_key
       (id, name, key_hash, key_prefix, created_at, created_by, last_used_at)
     VALUES
       (@id, @name, @key_hash, @key_prefix, @created_at, @created_by, NULL)`,
  ).run(row);

  return {
    token,
    key: toRow({ ...row, last_used_at: null }),
  };
}

/** Revoke. Deleted rather than flagged: a key nobody can use has no history worth keeping. */
export function deleteApiKey(id: string): void {
  db.prepare("DELETE FROM mits_api_key WHERE id = ?").run(id);
}

/**
 * The key behind a presented token, or null.
 *
 * `last_used_at` is written on every accepted call. That is one small write per
 * request against a table with a handful of rows, and it is the only thing that
 * makes "which of these six keys can I delete" answerable.
 */
export function verifyApiKey(token: string | null | undefined): ApiKeyRow | null {
  const value = token?.trim();
  if (!value || !value.startsWith(API_KEY_PREFIX)) return null;

  const row = db
    .prepare(
      `SELECT id, name, key_prefix, created_at, created_by, last_used_at
         FROM mits_api_key WHERE key_hash = ?`,
    )
    .get(hash(value)) as Parameters<typeof toRow>[0] | undefined;

  if (!row) return null;

  db.prepare("UPDATE mits_api_key SET last_used_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    row.id,
  );

  return toRow(row);
}

/**
 * The token out of an `Authorization: Bearer …` header.
 *
 * The scheme is compared case-insensitively because that is what RFC 7235 says
 * it is, and a client sending `bearer` is not making a mistake worth a 401 that
 * says nothing.
 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
