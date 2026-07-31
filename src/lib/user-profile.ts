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
  input: MITSUserProfile,
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

  db.prepare(
    `INSERT INTO mits_user_profile
       (user_id, location_id, phone, street, postal_code, city, country,
        website, note, updated_at)
     VALUES
       (@user_id, @location_id, @phone, @street, @postal_code, @city, @country,
        @website, @note, @updated_at)
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
    user_id: userId,
    updated_at: new Date().toISOString(),
  });

  return profile;
}
