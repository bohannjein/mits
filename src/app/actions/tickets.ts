"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canViewBoard } from "@/lib/auth/roles";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { ticketReplyMail } from "@/lib/mail-templates";
import { MacroError, getMacro, runMacro } from "@/lib/macros";
import { TicketLinkError, addLink, removeLink } from "@/lib/ticket-links";
import { sendNotification, ticketUrl } from "@/lib/smtp";
import { CommentError, addComment } from "@/lib/ticket-comments";
import {
  TrashError,
  restoreComment,
  restoreTicket,
  softDeleteTicket,
} from "@/lib/trash";
import {
  TicketUpdateError,
  assignTicket,
  getTicketFor,
  setTicketPriority,
  setTicketStatus,
} from "@/lib/tickets";
import { WorklogError, addWorklog, deleteWorklog } from "@/lib/worklogs";
import { formatMinutes } from "@/lib/format";
import {
  CommentBodyFormat,
  CommentVisibility,
  TicketPriority,
  TicketStatus,
  formatTicketNumber,
  parseDurationMinutes,
  parseTicketNumber,
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
    return { ok: false, error: "Diese Aktion ist Agenten vorbehalten." };
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
    assignTicket(ticketId, assigneeId, auth.user);
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

  setTicketStatus(ticketId, status.data, auth.user);
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

  setTicketPriority(ticketId, priority.data, auth.user);
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
/**
 * Post a public reply and close the ticket in one step.
 *
 * One action rather than two calls from the client: the reply and the status
 * change are what the agent means by "done", and two round-trips can leave a
 * ticket answered but open if the second one fails. The comment is written first,
 * so a failure there does not close a ticket nobody replied to.
 *
 * Deliberately public-only. "Answer and close" that quietly filed an internal
 * note would close a ticket the reporter never heard about.
 */
/**
 * Which body format the form claims to be sending.
 *
 * A claim, not a decision: `addComment` sanitises anything marked `html` before it
 * is stored, so the worst a forged value achieves is that plain text gets run
 * through the sanitiser — which leaves plain text. Anything unrecognised falls back
 * to `text`, the format that is never handed to `dangerouslySetInnerHTML`.
 */
function claimedFormat(formData: FormData): CommentBodyFormat {
  return CommentBodyFormat.safeParse(formData.get("bodyFormat")).data ?? "text";
}

export async function replyAndCloseAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  let comment;
  try {
    comment = addComment(
      ticketId,
      auth.user,
      String(formData.get("body") ?? ""),
      "public",
      claimedFormat(formData),
    );
  } catch (error) {
    if (error instanceof CommentError) return { ok: false, error: error.message };
    throw error;
  }

  setTicketStatus(ticketId, "closed", auth.user);

  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");

  if (auth.ticket.created_by_email !== comment.author_email) {
    await sendNotification({
      to: auth.ticket.created_by_email,
      ...ticketReplyMail(
        auth.ticket,
        { author: comment.author_name, body: comment.body },
        ticketUrl(auth.ticket.id),
      ),
    });
  }

  return { ok: true, message: "Antwort gesendet, Ticket geschlossen." };
}

/* ── Ticket links ───────────────────────────────────────────────────────── */

export async function addTicketLinkAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  // A switched-off module refuses on the server too, not just in the UI.
  if (!isFeatureEnabled("feature_ticket_linking")) {
    return { ok: false, error: "Ticket-Verknüpfung ist abgeschaltet." };
  }

  const number = parseTicketNumber(String(formData.get("target") ?? ""));
  if (number === null) {
    return {
      ok: false,
      error: `Bitte eine Ticket-Nummer angeben, z. B. ${formatTicketNumber(1042)}.`,
    };
  }

  try {
    addLink(ticketId, number, String(formData.get("kind") ?? ""), auth.user);
  } catch (error) {
    if (error instanceof TicketLinkError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/mits/tickets/${ticketId}`);
  return { ok: true, message: "Verknüpfung angelegt." };
}

export async function removeTicketLinkAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    removeLink(String(formData.get("linkId") ?? ""), ticketId, auth.user);
  } catch (error) {
    if (error instanceof TicketLinkError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/mits/tickets/${ticketId}`);
  return { ok: true, message: "Verknüpfung entfernt." };
}

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
      claimedFormat(formData),
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

/* ── Macros ─────────────────────────────────────────────────────────────── */

/**
 * Result of a macro run.
 *
 * Carries an extra `insert` because that is the one thing the server decides and
 * the client has to act on: the placeholder-filled reply text goes into the
 * composer, and the agent presses send. Filling it here rather than in the browser
 * keeps the reporter's name out of a template the client renders — the same rule
 * the canned-response dropdown follows.
 */
export type MacroActionResult =
  | { ok: true; message: string; insert: string | null }
  | { ok: false; error: string };

export async function runMacroAction(
  _previous: MacroActionResult | null,
  formData: FormData,
): Promise<MacroActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  // A switched-off module refuses on the server too, not just by hiding a button.
  if (!isFeatureEnabled("feature_macros")) {
    return { ok: false, error: "Makros sind abgeschaltet." };
  }

  const macro = getMacro(String(formData.get("macroId") ?? ""));
  if (!macro) return { ok: false, error: "Makro nicht gefunden." };

  let outcome;
  try {
    outcome = runMacro(macro, auth.ticket, auth.user);
  } catch (error) {
    if (error instanceof MacroError) return { ok: false, error: error.message };
    if (error instanceof CommentError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");

  /*
   * The mail goes out only for a macro that actually sent something, and only to
   * somebody other than the author — the same three conditions `addCommentAction`
   * checks, because this is the second path that can produce a public reply and
   * the reporter should not be able to tell which one was used.
   */
  if (outcome.sent && outcome.body && auth.ticket.created_by_email !== auth.user.email) {
    await sendNotification({
      to: auth.ticket.created_by_email,
      ...ticketReplyMail(
        auth.ticket,
        { author: auth.user.name, body: outcome.body },
        ticketUrl(auth.ticket.id),
      ),
    });
  }

  return {
    ok: true,
    message:
      outcome.steps.length > 0
        ? `„${macro.title}“ ausgeführt — ${outcome.steps.join(", ")}.`
        : `„${macro.title}“ ausgeführt — nichts zu ändern.`,
    insert: outcome.insert,
  };
}

/* ── Worklogs ───────────────────────────────────────────────────────────── */

/**
 * Book time against a ticket.
 *
 * The duration arrives as whatever the agent typed — "45", "1:30", "1,5 Std" — and
 * is parsed on the server rather than in the browser. Both sides could parse it,
 * but only one of them decides what gets stored, and a client that sends a plain
 * number would otherwise be trusted to have done the sixty-times conversion.
 */
export async function addWorklogAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  const raw = String(formData.get("duration") ?? "");
  const minutes = parseDurationMinutes(raw);
  if (minutes === null) {
    return {
      ok: false,
      error: `„${raw.trim() || "leer"}“ ist keine Dauer. Erlaubt sind z. B. 45, 45 Min, 1:30 oder 1,5 Std.`,
    };
  }

  try {
    addWorklog(
      ticketId,
      auth.user,
      minutes,
      String(formData.get("note") ?? ""),
      String(formData.get("performedAt") ?? ""),
    );
  } catch (error) {
    if (error instanceof WorklogError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");

  return { ok: true, message: `${formatMinutes(minutes)} erfasst.` };
}

export async function deleteWorklogAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    deleteWorklog(String(formData.get("worklogId") ?? ""), ticketId, auth.user);
  } catch (error) {
    if (error instanceof WorklogError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");

  return { ok: true, message: "Eintrag entfernt." };
}

/* ── Trash ──────────────────────────────────────────────────────────────── */

/**
 * Move a ticket to the trash.
 *
 * `authorize(..., true)` for staff, and `softDeleteTicket` checks the role again — not
 * redundant paranoia but the same rule as everywhere else here: this action is
 * reachable as a POST to any route it is used from, and the library function is
 * reachable from a future caller that forgets.
 *
 * Redirects rather than returning a result. The page the agent is on renders a ticket
 * that no longer passes `getTicketFor`, so staying would show a 404 — the queue is
 * where they belong afterwards.
 */
export async function softDeleteTicketAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    softDeleteTicket(ticketId, auth.user);
  } catch (error) {
    if (error instanceof TrashError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/mits");
  revalidatePath("/admin/settings/data");
  redirect("/mits");
}

/** Bring one back. Called from the trash view, which is admin-only. */
export async function restoreTicketAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const user = await requireUser("/admin/settings/data");
  if (!canViewBoard(user.role)) {
    return { ok: false, error: "Diese Aktion ist Agenten vorbehalten." };
  }

  const ticketId = String(formData.get("ticketId") ?? "");

  try {
    restoreTicket(ticketId, user);
  } catch (error) {
    if (error instanceof TrashError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/mits");
  revalidatePath("/admin/settings/data");
  revalidatePath(`/mits/tickets/${ticketId}`);

  return { ok: true, message: "Ticket wiederhergestellt." };
}

export async function restoreCommentAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const user = await requireUser("/admin/settings/data");
  if (!canViewBoard(user.role)) {
    return { ok: false, error: "Diese Aktion ist Agenten vorbehalten." };
  }

  const commentId = String(formData.get("commentId") ?? "");

  let result;
  try {
    result = restoreComment(commentId, user);
  } catch (error) {
    if (error instanceof TrashError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/admin/settings/data");
  revalidatePath(`/mits/tickets/${result.ticketId}`);
  revalidatePath(`/customer/tickets/${result.ticketId}`);

  return { ok: true, message: "Beitrag wiederhergestellt." };
}
