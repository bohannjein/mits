import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  EMPTY_USER_PROFILE,
  MITSUserProfileSchema,
  isWebsiteUrl,
  normaliseWebsite,
  type MITSUserProfile,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Reporter contact details.

   A row per user, written the first time somebody fills anything in. Absent is a
   perfectly normal state, so reading returns the empty profile rather than null —
   every caller wants to render fields either way, and `?? EMPTY` at four call sites
   is four chances to forget.
   ────────────────────────────────────────────────────────────────────────── */

interface ProfileRow extends MITSUserProfile {
  user_id: string;
  updated_at: string;
}

export class UserProfileError extends Error {}

export function getUserProfile(userId: string): MITSUserProfile {
  const row = db
    .prepare("SELECT * FROM mits_user_profile WHERE user_id = ?")
    .get(userId) as ProfileRow | undefined;

  if (!row) return EMPTY_USER_PROFILE;

  /*
   * Parsed rather than cast, and falling back on failure. A column added in a later
   * version is missing from an older row, and a profile that refuses to load would
   * take the whole settings page — and the ticket detail sidebar — down with it.
   */
  const parsed = MITSUserProfileSchema.safeParse(row);
  return parsed.success ? parsed.data : EMPTY_USER_PROFILE;
}

/**
 * Replace one user's profile.
 *
 * The whole record at once: the form posts every field, so a partial update would
 * need a second decision about what an absent field means. `locationExists` is
 * injected rather than imported to keep this module a leaf — the caller already knows
 * the locations because it renders the picker.
 */
export function setUserProfile(
  userId: string,
  /*
   * The organization is omitted from the parameter, not merely ignored inside. A
   * caller that tries to pass it does not compile, which is a better guarantee than a
   * comment saying it will be dropped.
   */
  input: Omit<MITSUserProfile, "organization_id">,
  locationExists: (id: string) => boolean,
): MITSUserProfile {
  const parsed = MITSUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new UserProfileError(
      parsed.error.issues[0]?.message ?? "Die Angaben sind zu lang.",
    );
  }

  const profile = { ...parsed.data };

  // A stale id from a cached form must not attach the profile to nothing.
  if (profile.location_id && !locationExists(profile.location_id)) {
    throw new UserProfileError("Der gewählte Standort ist unbekannt.");
  }

  if (profile.website) {
    profile.website = normaliseWebsite(profile.website);
    if (!isWebsiteUrl(profile.website)) {
      throw new UserProfileError(
        "Die Website muss eine http- oder https-Adresse mit Domain sein.",
      );
    }
  }

  /*
   * The organization is read from the row and written back unchanged, never taken from
   * `input`. The customer form does not offer the field, but "the form does not post it"
   * is not a rule — this is. Only `setUserOrganization` moves somebody between
   * companies, and that path checks for admin.
   */
  const organizationId = getUserOrganizationId(userId);

  db.prepare(
    `INSERT INTO mits_user_profile
       (user_id, location_id, organization_id, phone, street, postal_code, city,
        country, website, note, updated_at)
     VALUES
       (@user_id, @location_id, @organization_id, @phone, @street, @postal_code,
        @city, @country, @website, @note, @updated_at)
     ON CONFLICT(user_id) DO UPDATE SET
       location_id = excluded.location_id,
       phone       = excluded.phone,
       street      = excluded.street,
       postal_code = excluded.postal_code,
       city        = excluded.city,
       country     = excluded.country,
       website     = excluded.website,
       note        = excluded.note,
       updated_at  = excluded.updated_at`,
  ).run({
    ...profile,
    organization_id: organizationId,
    user_id: userId,
    updated_at: new Date().toISOString(),
  });

  return { ...profile, organization_id: organizationId };
}

/** Null when the user has no profile row yet, or none assigned. */
export function getUserOrganizationId(userId: string): string | null {
  const row = db
    .prepare("SELECT organization_id FROM mits_user_profile WHERE user_id = ?")
    .get(userId) as { organization_id: string | null } | undefined;
  return row?.organization_id ?? null;
}

/**
 * Move a user into an organization, or out of every organization with null.
 *
 * Separate from `setUserProfile` so the privileged field has its own entry point: a
 * caller cannot reach it by posting an extra key, only by calling a function whose name
 * says what it does. `organizationExists` is injected for the same reason
 * `locationExists` is — this module stays a leaf.
 *
 * Upserts, because assigning a company may well be the first thing recorded about
 * somebody who never opened their own settings.
 */
export function setUserOrganization(
  userId: string,
  organizationId: string | null,
  organizationExists: (id: string) => boolean,
): void {
  if (organizationId && !organizationExists(organizationId)) {
    throw new UserProfileError("Die gewählte Firma ist unbekannt.");
  }

  db.prepare(
    `INSERT INTO mits_user_profile (user_id, organization_id, updated_at)
     VALUES (@user_id, @organization_id, @updated_at)
     ON CONFLICT(user_id) DO UPDATE SET
       organization_id = excluded.organization_id,
       updated_at      = excluded.updated_at`,
  ).run({
    user_id: userId,
    organization_id: organizationId,
    updated_at: new Date().toISOString(),
  });
}
