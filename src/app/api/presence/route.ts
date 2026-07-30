import { canViewBoard } from "@/lib/auth/roles";
import { requireApiUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { touchPresence } from "@/lib/presence";

/* ──────────────────────────────────────────────────────────────────────────
   Presence heartbeat.

   POST only, and it takes no body — the acting user comes from the session, so
   there is nothing a caller could claim about themselves. Marking a colleague as
   active would be a small lie with a real consequence: a ticket dispatched to
   someone who is not there.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  // A switched-off module must not keep writing. Answering 204 rather than 403
  // keeps the client quiet: it has nothing to react to and no reason to retry.
  if (!isFeatureEnabled("feature_presence_sidebar")) {
    return new Response(null, { status: 204 });
  }

  // Reporters are deliberately not tracked. Same answer as above — the client
  // should not learn from the status code whether it is staff.
  if (!canViewBoard(auth.user.role)) {
    return new Response(null, { status: 204 });
  }

  touchPresence(auth.user.id, auth.user.role);

  return new Response(null, { status: 204 });
}
