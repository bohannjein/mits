"use server";

import { revalidatePath } from "next/cache";

import { canViewBoard } from "@/lib/auth/roles";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { ticketReplyMail } from "@/lib/mail-templates";
import { sendNotification, ticketUrl } from "@/lib/smtp";
import { CommentError, addComment } from "@/lib/ticket-comments";
import {
  TicketUpdateError,
  assignTicket,
  getTicketFor,
  setTicketPriority,
  setTicketStatus,
} from "@/lib/tickets";
import {
  CommentVisibility,
  TicketPriority,
  TicketStatus,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket workflow actions.

   Every one re-reads the session and re-checks access to *this* ticket. A Server
   Function is reachable as a POST to whatever route it is used from, so being
   rendered inside an agent-only panel proves nothing about the caller.

   `getTicketFor` is the access check: it answers null both for a missing ticket
   and for one the caller may not see, so nothing here can be used to probe which
   ticket ids exist.
   ────────────────────────────────────────────────────────────────────────── */

export type TicketActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Shared preamble: authenticated, ticket visible, and staff if required.
 *
 * Explicitly tagged rather than relying on `"error" in result` narrowing — an
 * untagged union of two object shapes leaves `error` as `string | undefined` at
 * the call site, which is exactly the kind of maybe-undefined that ends up
 * rendered as "undefined" in a UI.
 */
type Authorized =
  | { ok: true; user: SessionUser; ticket: MITSTicket }
  | { ok: false; error: string };

async function authorize(
  ticketId: string,
  requireAgent: boolean,
): Promise<Authorized> {
  const user = await requireUser(`/mits/tickets/${ticketId}`);

  if (requireAgent && !canViewBoard(user.role)) {
    return { ok: false, error: "Diese Aktion ist der Technik vorbehalten." };
  }

  const ticket = getTicketFor(ticketId, user);
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };

  return { ok: true, user, ticket };
}

export async function assignTicketAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  const raw = String(formData.get("assigneeId") ?? "");
  // The picker's "unassigned" option and a self-assign button both land here; an
  // empty value means clear rather than "assign to nobody in particular".
  const assigneeId = raw === "" || raw === "__none" ? null : raw;

  try {
    assignTicket(ticketId, assigneeId);
  } catch (error) {
    if (error instanceof TicketUpdateError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");
  revalidatePath("/mits");

  return {
    ok: true,
    message: assigneeId ? "Ticket zugewiesen." : "Zuweisung aufgehoben.",
  };
}

export async function setTicketStatusAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  const status = TicketStatus.safeParse(formData.get("status"));
  if (!status.success) return { ok: false, error: "Unbekannter Status." };

  setTicketStatus(ticketId, status.data);
  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");
  revalidatePath("/mits");

  return { ok: true, message: "Status geändert." };
}

export async function setTicketPriorityAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  const priority = TicketPriority.safeParse(formData.get("priority"));
  if (!priority.success) return { ok: false, error: "Unbekannte Priorität." };

  setTicketPriority(ticketId, priority.data);
  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");

  return { ok: true, message: "Priorität geändert." };
}

/**
 * Post a reply or an internal note.
 *
 * Anyone who can see the ticket may reply — that includes the reporter, which is
 * the point of a ticket thread. Only staff may choose `internal`, and
 * `addComment` refuses rather than downgrading: silently publishing a note meant
 * to stay internal is the worse failure.
 */
export async function addCommentAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, false);
  if (!auth.ok) return { ok: false, error: auth.error };

  const visibility = CommentVisibility.safeParse(
    formData.get("visibility") ?? "public",
  );
  if (!visibility.success) {
    return { ok: false, error: "Unbekannte Sichtbarkeit." };
  }

  let comment;
  try {
    comment = addComment(
      ticketId,
      auth.user,
      String(formData.get("body") ?? ""),
      visibility.data,
    );
  } catch (error) {
    if (error instanceof CommentError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);

  /*
   * Notify the reporter, under three conditions that all have to hold:
   *
   *   1. The comment is public. An internal note must never leave MITS, and this
   *      is the second gate on that after `addComment` — the mail path is the one
   *      place where a mistake cannot be taken back.
   *   2. An agent wrote it. The reporter answering their own ticket should not be
   *      mailed their own words back.
   *   3. The recipient is not the author, so an agent filing a ticket for
   *      themselves does not get a notification about their own reply.
   *
   * The comment is already stored at this point; a failed send is logged, not
   * surfaced, because there is nothing the agent could do about it here.
   */
  if (
    comment.visibility === "public" &&
    comment.author_is_agent &&
    auth.ticket.created_by_email !== comment.author_email
  ) {
    await sendNotification({
      to: auth.ticket.created_by_email,
      ...ticketReplyMail(
        auth.ticket,
        { author: comment.author_name, body: comment.body },
        ticketUrl(auth.ticket.id),
      ),
    });
  }

  return {
    ok: true,
    message:
      visibility.data === "internal"
        ? "Interne Notiz gespeichert — für den Melder nicht sichtbar."
        : "Antwort gespeichert.",
  };
}
