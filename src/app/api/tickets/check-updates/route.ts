import { requireApiUser } from "@/lib/auth/session";
import { queueFingerprint } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   "Has my queue changed?" — answered with four aggregates or with nothing.

   The fallback path for the ticket list, and the reason the old arrangement was
   expensive: a refresh pulled every visible ticket out of the database, rendered
   fifty rows and shipped the RSC payload, whether or not one of them had moved.
   Most of the time nothing had.

   This asks the cheap question instead. The client sends the ETag it holds; if
   the fingerprint still matches, the answer is a bodyless **304** and the page
   does nothing at all. Only a real difference costs a refresh, and then it is one
   the reader actually needed.

   **The ETag is per user, and that is load-bearing rather than tidy.** Its value
   is derived from rows the caller may see — a reporter's moves when their own
   ticket does and not when the desk is busy. A shared ETag would leak the shape
   of everybody else's activity to anybody who watched it change, which is a
   strange amount of information to hand out for a caching header.

   `private, no-cache` rather than `no-store`: `no-store` forbids the browser from
   keeping the response at all, which would stop it revalidating and defeat the
   whole mechanism. `private` keeps a shared proxy from ever holding one user's
   fingerprint and handing it to another.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const etag = `"${queueFingerprint(auth.user)}"`;

  /*
   * `If-None-Match` may legitimately carry several values, and a proxy is allowed
   * to weaken a tag by prefixing `W/`. Comparing the whole header for equality
   * works right up until either happens and then never matches again — a queue
   * that refetches on every tick and looks exactly like one that is working.
   */
  const candidates = (request.headers.get("if-none-match") ?? "")
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""));

  if (candidates.includes(etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }

  return Response.json(
    { fingerprint: etag },
    { headers: { ETag: etag, "Cache-Control": "private, no-cache" } },
  );
}
