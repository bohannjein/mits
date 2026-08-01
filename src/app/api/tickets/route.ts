import { requireApiUser } from "@/lib/auth/session";
import { ticketCreatedMail } from "@/lib/mail-templates";
import { sendNotification, ticketUrl } from "@/lib/smtp";
import { getSystemTimezone } from "@/lib/system-settings";
import { parseTicketQuery } from "@/lib/ticket-query";
import {
  TicketValidationError,
  createTicket,
  listOwnTickets,
  listTicketsFor,
  searchTickets,
} from "@/lib/tickets";
import { MITSTicketDraftSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket API.

   Authorization is enforced here, not in the proxy: route handlers are reachable
   directly and the proxy is only a fast path. Every request re-reads the session
   from the database, and `requireApiUser` additionally refuses an account that
   still has to change a default password.
   ────────────────────────────────────────────────────────────────────────── */

/** Live results for the search dialog. Enough rows to choose from, not a dump. */
const SEARCH_LIMIT = 25;

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;

  // `?scope=own` narrows a agent's or admin's listing to their own tickets
  // — what the portal's "my tickets" panel needs. Narrowing only: the role still
  // sets the ceiling, so this parameter can never widen what is returned.
  const scope = params.get("scope");

  /*
   * The search dialog queries this endpoint as the agent types. It goes through
   * the same `parseTicketQuery` → `searchTickets` path as the queue page, so the
   * visibility rule is identical: the role sets the scope in the SQL clause before
   * any filter is applied, and a parameter can only narrow the result.
   *
   * `parseTicketQuery` also validates: an unknown status or a malformed date is
   * dropped rather than passed through, so a hand-built query cannot smuggle
   * anything into the clause.
   */
  if (params.has("search")) {
    const raw = Object.fromEntries(params.entries());
    const { filter } = parseTicketQuery(raw, {
      ownOnly: scope === "own",
    });
    const tickets = searchTickets(filter, auth.user).slice(0, SEARCH_LIMIT);
    return Response.json({ tickets });
  }

  const tickets =
    scope === "own"
      ? listOwnTickets(auth.user.id)
      : listTicketsFor(auth.user);

  return Response.json({ tickets });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const draft = MITSTicketDraftSchema.safeParse(body);
  if (!draft.success) {
    return Response.json(
      {
        error: "Entwurf ist unvollständig.",
        issues: draft.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const ticket = createTicket(draft.data, user);

    /*
     * Notify after the ticket exists, and never let the mail decide whether it
     * does. `createTicket` is synchronous and lives in a module that has no
     * business knowing about SMTP, so the trigger sits here rather than inside
     * it — the roadmap said "after the transaction", and outside the function is
     * the honest version of that.
     *
     * Awaited rather than fired and forgotten: a serverless invocation can be
     * frozen the moment the response is returned, which would drop the mail
     * silently. `sendNotification` swallows its own failures and the SMTP client
     * has short timeouts, so the worst case is a slower 201, not a lost ticket.
     */
    await sendNotification({
      to: ticket.created_by_email,
      ...ticketCreatedMail(ticket, ticketUrl(ticket.id), getSystemTimezone()),
    });

    return Response.json({ ticket }, { status: 201 });
  } catch (error) {
    if (error instanceof TicketValidationError) {
      return Response.json(
        { error: error.message, issues: error.issues },
        { status: 422 },
      );
    }
    throw error;
  }
}
