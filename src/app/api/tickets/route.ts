import { getSessionUserFor } from "@/lib/auth/session";
import {
  TicketValidationError,
  createTicket,
  listTicketsFor,
} from "@/lib/tickets";
import { MITSTicketDraftSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket API.

   Authorization is enforced here, not in the proxy: route handlers are reachable
   directly and the proxy is only a fast path. Every request re-reads the session
   from the database.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const user = await getSessionUserFor(request);
  if (!user) return unauthorized();

  // Scope comes from the role, never from a query parameter — a plain user
  // cannot ask for anyone else's tickets.
  return Response.json({ tickets: listTicketsFor(user) });
}

export async function POST(request: Request) {
  const user = await getSessionUserFor(request);
  if (!user) return unauthorized();

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

function unauthorized() {
  return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
}
