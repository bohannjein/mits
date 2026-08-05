import { timingSafeEqual } from "node:crypto";

import { canAdminister } from "@/lib/auth/roles";
import { serviceToken } from "@/lib/auth/secret";
import { getSessionUserFor } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { publish } from "@/lib/services/realtime";
import { usersWithDueReminders } from "@/lib/ticket-reminders";

/* ──────────────────────────────────────────────────────────────────────────
   Wake up whoever has a reminder due.

   **This endpoint delivers nothing.** It publishes one content-free `notify`
   signal per person with something due; their browser then asks
   `/api/notifications`, which is the one place that decides what a session may be
   told about. That is the rule the whole realtime bus follows — a bus that
   shipped payloads would be a second place deciding visibility, and the second
   one is the one that gets it wrong.

   **It is also not required for a reminder to fire.** `listNotifications` derives
   due reminders from `mits_ticket_reminder` on every poll, so an instance with no
   scheduler at all still announces them within the notification interval (20 s by
   default, or the fallback poll when the stream is down). What this buys is
   *punctuality*: a reminder set for 09:00 arrives at 09:00 rather than up to
   twenty seconds later, and on an instance where the stream is up — where there
   is no poll interval at all — it arrives instead of waiting for the next thing
   that happens to trigger a fetch. On that last point it is not a nicety: with a
   live stream and a quiet desk, nothing else would fetch.

   Same reasoning as the mail poller for why there is no in-process timer: a
   `setInterval` in a Next server runs once per worker, keeps running on an
   instance nobody uses, and cannot be paused or observed from outside the
   process.

       curl -X POST -H "X-MITS-Service-Token: $(cat data/service-token)" \
            http://mits.local:3000/api/cron/reminders

   Once a minute is the sensible entry. More often costs a single indexed read and
   buys nothing a person can perceive; less often makes the presets lie.

   Two ways in, matching `/api/mail/poll`: the service token for a scheduler, or an
   admin session so the URL can be opened in a browser to see what it reports.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Constant-time comparison, after a length check.
 *
 * Copied in shape from `/api/mail/poll` rather than shared: `timingSafeEqual`
 * throws on differing lengths, so the length is compared first, and that
 * comparison is not a leak — the token length is a constant of this build.
 */
function tokenMatches(provided: string): boolean {
  const expected = serviceToken();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const provided = request.headers.get("x-mits-service-token") ?? "";

  // Fail closed: an empty header never matches, because `serviceToken()` always
  // returns a generated value. There is no configuration in which the check is
  // skipped rather than merely impossible to pass.
  let authorized = provided !== "" && tokenMatches(provided);

  if (!authorized) {
    const user = await getSessionUserFor(request);
    authorized =
      user !== null && !user.mustChangePassword && canAdminister(user.role);
  }

  if (!authorized) {
    return Response.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  if (!isFeatureEnabled("feature_ticket_reminders")) {
    // 409, not 404: the endpoint exists and the request was well formed. A
    // scheduler's log should say "the module is off" rather than report a URL
    // that does not exist.
    return Response.json(
      { error: "Erinnerungen sind abgeschaltet." },
      { status: 409 },
    );
  }

  const userIds = usersWithDueReminders();

  /*
   * One signal per person, addressed by `actorId`… inverted.
   *
   * `publish` skips the subscriber whose id matches `actorId` — it exists so the
   * page that caused a change is not told to re-render what it already rendered.
   * There is no "only this user" field, and adding one would be a second
   * addressing mode on a bus whose entire contract is "signals, not data".
   *
   * So this fans out one plain `notify` to everybody instead. The cost is that a
   * quiet browser refetches its own notification feed — an indexed read that
   * answers with an empty list — and the alternative was a new routing concept in
   * the bus for a once-a-minute nudge. `audience: "all"` because a reporter can
   * hold a reminder on their own ticket.
   */
  if (userIds.length > 0) {
    publish({ type: "notify", audience: "all" });
  }

  return Response.json({
    ok: true,
    // The count, not the ids. A scheduler's log is a place where a list of user
    // ids would sit in plain text for as long as the log is kept.
    due: userIds.length,
  });
}
