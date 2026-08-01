import { requireApiUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { getNotificationSettings } from "@/lib/notification-settings";
import { listNotifications } from "@/lib/notifications";
import { summariseNotifications } from "@/lib/services/ai/digest";

/* ──────────────────────────────────────────────────────────────────────────
   One summary instead of a wall of toasts.

   Called by the watcher when a single poll comes back with at least
   `digestThreshold` events — somebody was in a meeting, or the tab was in the
   background over lunch.

   **The events are re-derived here from `since`, never taken from the request.**
   The client already has them; accepting them back would mean summarising text a
   browser supplied and handing the result to a language model, which is a
   prompt-injection surface and a way to be told about tickets the caller cannot
   see. `listNotifications` applies the same scope rule it always does, so the
   digest can only ever describe rows this session was already allowed.

   Separate from `GET /api/notifications` on purpose. That one runs every twenty
   seconds and has to stay a cheap indexed read; this one may wait on a model, and
   only runs on the rare poll that finds a backlog.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  if (!isFeatureEnabled("feature_toast_notifications")) {
    return Response.json({ digest: null });
  }

  const body = (await request.json().catch(() => null)) as {
    since?: unknown;
  } | null;
  const since = typeof body?.since === "string" ? body.since : "";

  const events = listNotifications(auth.user, since);
  const settings = getNotificationSettings();

  /*
   * Nothing to summarise, or the admin switched the digest off.
   *
   * Answered with `digest: null` and 200 rather than an error: the client falls
   * back to individual toasts, which is the correct behaviour and not a failure.
   * A 4xx here would be logged as one.
   */
  if (settings.digestThreshold === 0 || events.length < settings.digestThreshold) {
    return Response.json({ digest: null });
  }

  const digest = await summariseNotifications(
    events.map((event) => ({
      kind: event.kind,
      title: event.title,
      description: event.description,
    })),
  );

  /*
   * The newest timestamp of what was actually summarised.
   *
   * The client advances its cursor to this rather than to "now", for the same
   * reason the individual path does: anything written between the server building
   * this list and the browser reading it would otherwise be skipped, and a
   * silently dropped reply leaves no trace that it was dropped.
   */
  const latest = events.reduce(
    (newest, event) => (event.createdAt > newest ? event.createdAt : newest),
    since,
  );

  return Response.json(
    { digest, latest },
    { headers: { "Cache-Control": "no-store" } },
  );
}
