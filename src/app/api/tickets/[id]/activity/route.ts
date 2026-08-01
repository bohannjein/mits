import { requireApiUser } from "@/lib/auth/session";
import { ticketActivityFingerprint } from "@/lib/ticket-comments";
import { getTicketFor } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   "Has this ticket changed?" — nothing more.

   The one endpoint behind the live conversation. It answers with a short
   fingerprint; the client compares it with the one it holds and, when they
   differ, calls `router.refresh()`. The new messages then arrive through the
   ordinary server render of the page.

   **Deliberately not an endpoint that returns the comments.** Two reasons, and
   the second is the one that matters:

   - A poll every few seconds that ships every body re-sends the whole
     conversation once a tick for the ninety-nine ticks where nothing happened.
   - Returning them here would make this a *second* place that decides what a
     reader may see. The page already resolves the thread through
     `listCommentsFor`, and the visibility rule for an internal note would then
     live in two files — one of which somebody would eventually change alone.

   `getTicketFor` first, and its `null` is a 404 rather than a 403: the same rule
   the page follows, so this route cannot be used to find out which ids exist.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const ticket = getTicketFor(id, auth.user);
  if (!ticket) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  /*
   * The same function the page called to seed the client. The ticket's own state
   * is in there as well as the thread's — a status change or a reassignment is
   * not a comment, but it is a change to what the page shows, and without it two
   * agents on one ticket would see each other's replies live and each other's
   * status changes not at all.
   */
  return Response.json(
    { fingerprint: ticketActivityFingerprint(ticket, auth.user) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
