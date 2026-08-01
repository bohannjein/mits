/* ──────────────────────────────────────────────────────────────────────────
   Timestamp formatting.

   No server imports on purpose: client components need these too, and the
   timezone reaches them through context rather than through a database read.

   Every timestamp in MITS goes through here with an explicit `timeZone`. Without
   one, `toLocaleString` uses whatever zone the *renderer* is in — the container's
   during a server render, the visitor's laptop afterwards. Those disagree for a
   server in UTC and a user in Berlin, which produced two failure modes at once: a
   hydration mismatch, and a support call about a ticket that claims to have arrived
   two hours before it did.
   ────────────────────────────────────────────────────────────────────────── */

/** Fallback when nothing is configured. Matches where this is deployed. */
export const DEFAULT_TIMEZONE = "Europe/Berlin";

/**
 * Offered in the settings mask.
 *
 * A curated list rather than all ~600 IANA zones: a dropdown nobody can scroll is
 * not a dropdown. `isValidTimezone` accepts any zone the runtime knows, so an
 * instance that needs a different one can still be configured — by hand in the
 * database, or by adding it here.
 */
export const SYSTEM_TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Copenhagen",
  "Europe/Oslo",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Budapest",
  "Europe/Bucharest",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Europe/Moscow",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

/**
 * Whether the runtime can format in this zone.
 *
 * Asked by trying rather than by matching a list: the set of zones depends on the
 * ICU data compiled into the running Node, so the runtime is the only authority.
 * A zone that fails here would otherwise throw inside every render that formats a
 * date — one bad settings value taking every page down with it.
 */
export function isValidTimezone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** 31. Juli 2026, 14:05 */
export function formatDateTime(date: Date, timeZone: string): string {
  return date.toLocaleString("de-DE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  });
}

/** 31.07.26, 14:05 — for tables, where the column has to stay narrow. */
export function formatDateTimeShort(date: Date, timeZone: string): string {
  return date.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  });
}

/** 31.07.2026 */
export function formatDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString("de-DE", { timeZone });
}

/**
 * The zone's current offset, as `UTC+02:00`.
 *
 * Derived by formatting rather than by table lookup, so daylight saving is already
 * accounted for — the answer is the offset *now*, not the zone's standard offset.
 */
export function timezoneOffsetLabel(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    // Intl reports plain "GMT" at zero offset; spell it out so the field never
    // looks empty.
    return name === "GMT" ? "UTC+00:00" : (name?.replace("GMT", "UTC") ?? "");
  } catch {
    return "";
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Relative age.

   `vor 12 Min.` answers the question a queue actually asks — how long has this
   been sitting there — which an absolute timestamp only answers after the reader
   does the subtraction. The exact instant is never dropped, only moved into the
   `title` attribute, because "vor 3 Std." is useless in a handover note.

   Pure and `now`-as-a-parameter for two reasons: it is checkable offline at the
   bucket boundaries, and a caller that renders on both sides of hydration has to
   be able to decide *which* clock it means. Reading `Date.now()` in here would
   make the same element disagree between the server pass and the client pass, and
   the resulting mismatch is a warning nobody links back to a time format.
   ────────────────────────────────────────────────────────────────────────── */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Average calendar month. Good enough for "vor 3 Mon." on a closed ticket. */
const MONTH = 30.44 * DAY;

/**
 * `gerade eben`, `vor 12 Min.`, `vor 3 Std.`, `vor 4 Tagen`, `vor 2 Wo.`
 *
 * A timestamp in the future comes back as `gerade eben` rather than as a negative
 * age. That happens for real — a container in UTC and a mail server a few seconds
 * ahead are enough — and "in -1 Min." is a bug report waiting to be filed.
 */
export function formatRelativeTime(date: Date, now: number): string {
  const elapsed = now - date.getTime();
  if (elapsed < MINUTE) return "gerade eben";

  if (elapsed < HOUR) {
    return `vor ${Math.floor(elapsed / MINUTE)} Min.`;
  }
  if (elapsed < DAY) {
    return `vor ${Math.floor(elapsed / HOUR)} Std.`;
  }
  if (elapsed < WEEK) {
    const days = Math.floor(elapsed / DAY);
    return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
  }
  if (elapsed < MONTH) {
    return `vor ${Math.floor(elapsed / WEEK)} Wo.`;
  }
  return `vor ${Math.floor(elapsed / MONTH)} Mon.`;
}

/**
 * `45 Min`, `2 Std`, `1:30 Std` — the shapes people write on a timesheet.
 *
 * Minutes in, because minutes is what is stored: an hours-as-a-float column would
 * put the rounding in a different place in every report that summed it.
 */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.trunc(minutes));
  if (total < 60) return `${total} Min`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0
    ? `${hours} Std`
    : `${hours}:${String(rest).padStart(2, "0")} Std`;
}

/** `+412 ms`, `-1,3 s` — signed, because the direction is the whole point. */
export function formatOffsetMs(offsetMs: number): string {
  const sign = offsetMs >= 0 ? "+" : "−";
  const magnitude = Math.abs(offsetMs);
  if (magnitude < 1000) return `${sign}${Math.round(magnitude)} ms`;
  return `${sign}${(magnitude / 1000).toFixed(1).replace(".", ",")} s`;
}
