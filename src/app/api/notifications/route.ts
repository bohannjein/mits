import { requireApiUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { listNotifications } from "@/lib/notifications";

/* ──────────────────────────────────────────────────────────────────────────
   What has happened since `?since=`.

   Polled, not pushed. Server-sent events would hold a connection per open tab,
   which a single-process self-hosted Node app behind whatever reverse proxy the
   operator chose cannot be relied on to survive — and the failure mode of a
   silently dropped stream is a client that believes it is up to date. A poll that
   misses a beat catches up on the next one.

   The scope rule lives in `listNotifications`, not here: an event is only ever
   built from a row the caller may already see. This handler adds the session check
   and the feature gate.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  /*
   * A disabled module answers with an empty list and 200, not 404.
   *
   * The client polls this on a timer; a 404 would be logged as an error on every
   * tick for an instance that simply switched the module off. An empty array is
   * the true answer either way — there is nothing to show.
   */
  if (!isFeatureEnabled("feature_toast_notifications")) {
    return Response.json({ notifications: [] });
  }

  const since = new URL(request.url).searchParams.get("since") ?? "";
  const notifications = listNotifications(auth.user, since);

  // Never cached: the whole value of this endpoint is that the answer differs
  // between two requests a few seconds apart.
  return Response.json(
    { notifications },
    { headers: { "Cache-Control": "no-store" } },
  );
}
