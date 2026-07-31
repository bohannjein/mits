import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   The CMDB API token.

   One shared secret per instance, for machine callers: a discovery script or an
   inventory agent has no session and cannot get one. Stored in `mits_setting`, generated
   on demand by an admin, rotatable.

   **Fail closed.** No stored token means token authentication is impossible — not that
   it is skipped. An endpoint that accepts any request while unconfigured is an open
   inventory on every fresh instance, and the CMDB knows every serial number in the
   building.

   Sessions remain the other way in, so a technician can open the endpoint in a browser.
   That is deliberate: the same data is on the CMDB pages, so a session that may read
   those may read this.
   ────────────────────────────────────────────────────────────────────────── */

const TOKEN_KEY = "cmdb_api_token";

/** The header a machine caller sends. */
export const API_TOKEN_HEADER = "x-mits-api-token";

export function getApiToken(): string | null {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(TOKEN_KEY) as { value: string } | undefined;
  const token = row?.value?.trim();
  return token ? token : null;
}

/** New token, replacing any previous one. Returned once for the admin to copy. */
export function rotateApiToken(): string {
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(TOKEN_KEY, token);
  return token;
}

/** Remove it, closing token access entirely. */
export function clearApiToken(): void {
  db.prepare("DELETE FROM mits_setting WHERE key = ?").run(TOKEN_KEY);
}

/**
 * Whether a presented token is the stored one.
 *
 * Compared with `timingSafeEqual` over fixed-length digests of equal size. A plain `===`
 * on secrets leaks their prefix through response timing; the token is long enough that
 * this is theoretical, and doing it right costs one function call.
 *
 * A length mismatch returns false before the comparison, because `timingSafeEqual`
 * throws on differing lengths — that throw would itself be the timing signal.
 */
export function isValidApiToken(presented: string | null): boolean {
  const stored = getApiToken();
  if (!stored || !presented) return false;

  const a = Buffer.from(presented.trim(), "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
