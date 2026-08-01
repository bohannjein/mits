import { canViewBoard } from "@/lib/auth/roles";
import { requireApiUser } from "@/lib/auth/session";
import { subscribe, type RealtimeEvent } from "@/lib/services/realtime";
import { getTicketFor } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   The Server-Sent Events stream.

   One long-lived GET per browser tab. Nothing travels over it while nothing
   happens, which is the whole point: the ticket page used to ask "anything new?"
   every two and a half seconds whether or not there was.

   **SSE rather than WebSockets.** The traffic is one-directional — the server
   tells, the client never asks — and SSE is a plain HTTP response that any
   reverse proxy already forwards, reconnects itself, and needs no second
   protocol, no upgrade handshake and no library. A WebSocket would buy
   bidirectionality this application has no use for and cost a deployment note
   for every proxy in front of it.

   **The `?ticket=` id is authorised here, once.** `getTicketFor` answers null for
   both "gone" and "not yours", and a null means the connection is simply not
   registered for any ticket — it still gets the other signals. Checking per event
   instead would put a database read in the fan-out path for something that cannot
   change while the connection is open.

   `X-Accel-Buffering: no` because nginx buffers proxied responses by default, and
   a buffered event stream is a stream that delivers nothing until it has a few
   kilobytes to say. That is the single most common way an SSE deployment appears
   to work locally and not in production.
   ────────────────────────────────────────────────────────────────────────── */

/** Node, not edge: the bus and the session check both reach for better-sqlite3. */
export const runtime = "nodejs";
/** Never prerender, never cache. A cached event stream is a contradiction. */
export const dynamic = "force-dynamic";

/**
 * A comment line every twenty-five seconds.
 *
 * Not for the browser — `EventSource` is happy to wait forever. It is for
 * everything in between: proxies and load balancers close an idle upstream after
 * thirty or sixty seconds, and the client then reconnects on a timer that looks
 * like a bug in this file. A colon line is the SSE comment syntax and costs three
 * bytes.
 */
const KEEPALIVE_MS = 25_000;

/** Nothing else may reach the `event:` line. See `deliver`. */
const ALLOWED_TYPES: RealtimeEvent["type"][] = ["ticket", "notify", "queue"];

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const user = auth.user;
  const requested = new URL(request.url).searchParams.get("ticket");

  // Authorised once, here. `null` when the caller may not see it — the stream
  // still connects, it simply carries no signals for that ticket.
  const ticketId =
    requested && getTicketFor(requested, user) ? requested : null;

  const encoder = new TextEncoder();

  /*
   * Held outside the stream object so `cancel` can reach the teardown that
   * `start` built. Assigned synchronously inside `start`, which always runs
   * before `cancel` can.
   */
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;

      const send = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The peer went away between the check and the write. Closing here
          // rather than letting the next event throw again.
          open = false;
        }
      };

      /*
       * An opening event, so the client knows the connection is live rather than
       * merely accepted. Without it the indicator would stay yellow until the
       * first real event, which on a quiet afternoon is never — and a status dot
       * that is wrong on a working system is worse than no dot.
       */
      send(`event: ready\ndata: {}\n\n`);

      const unsubscribe = subscribe({
        userId: user.id,
        staff: canViewBoard(user.role),
        ticketId,
        deliver: (event: RealtimeEvent) => {
          /*
           * Only the type and, for a ticket signal, the id the client already
           * knows it is watching. Nothing about content, and nothing it could not
           * have asked for through an authorised route.
           *
           * Built defensively, because a malformed frame is worse than a missing
           * one: `EventSource` cannot resynchronise mid-stream, so one bad line
           * breaks every event after it on that connection — and the client then
           * shows a live indicator over a page that has stopped updating.
           *
           * `type` is checked against the three known values rather than
           * interpolated, so nothing can put a newline into the `event:` line.
           * `ticketId` is normalised to a string or null; `undefined` serialises
           * the key away and leaves the client reading a property that is not
           * there.
           */
          if (!ALLOWED_TYPES.includes(event.type)) return;

          const payload = JSON.stringify({
            ticketId: typeof event.ticketId === "string" ? event.ticketId : null,
          });

          send(`event: ${event.type}\ndata: ${payload}\n\n`);
        },
      });

      const keepalive = setInterval(() => send(": ping\n\n"), KEEPALIVE_MS);
      keepalive.unref?.();

      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime; nothing left to do.
        }
      };

      // `abort` covers a navigation or a closed tab.
      request.signal.addEventListener("abort", close);
      // …and this is the other half, which was missing: the runtime tearing a
      // stream down calls `cancel`, not `abort`. Every such teardown left a
      // registration behind whose `deliver` writes into a dead controller on
      // every later publish — a leak that grows for as long as the process runs
      // and takes the fan-out with it.
      cleanup = close;
    },

    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
