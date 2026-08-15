"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { canViewBoard } from "@/lib/auth/roles";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { ticketReplyMail } from "@/lib/mail-templates";
import { ChecklistError, setChecklistValue } from "@/lib/ticket-checklist";
import { MacroError, getMacro, runMacro } from "@/lib/macros";
import { TicketLinkError, addLink, removeLink } from "@/lib/ticket-links";
import { sendNotification, ticketUrl } from "@/lib/smtp";
import {
  CommentError,
  addComment,
  editComment,
  retractComment,
} from "@/lib/ticket-comments";
import {
  TrashError,
  restoreComment,
  restoreTicket,
  softDeleteTicket,
  withdrawTicket,
} from "@/lib/trash";
import {
  TicketUpdateError,
  assignTicket,
  getTicketFor,
  setTicketAutoClose,
  setTicketCategory,
  setTicketCc,
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
 * Every page a ticket shows up on, revalidated together.
 *
 * There were thirteen call sites doing this by hand and they had drifted: all of
 * them refreshed the two detail views and the queue, **none** refreshed
 * `/customer/tickets`. So an agent could close a ticket and the reporter's own
 * list went on calling it open until something else happened to rebuild that
 * page — which is exactly the "the status does not change everywhere" report.
 *
 * One function, so a surface added later is added once. `/customer` is in it
 * because the portal has an open-tickets panel, and that panel counting a closed
 * ticket is the same bug one page over.
 */
function revalidateTicket(ticketId: string): void {
  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/customer/tickets");
  revalidatePath("/customer");
  revalidatePath("/mits");
  /*
   * Die Team-Übersicht zählt dieselben Zeilen und stand vorher nicht darin.
   * Genau die Lücke, die dieser Helfer schließen sollte: dreizehn Aufrufstellen
   * revalidierten von Hand, und keine kannte alle Flächen.
   */
  revalidatePath("/mits/team");
}

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

  revalidateTicket(ticketId);

  return {
    ok: true,
    message: assigneeId ? "Ticket zugewiesen." : "Zuweisung aufgehoben.",
  };
}

/**
 * Reassign and hand over in one step.
 *
 * The assignment goes through `assignTicket` and the note through `addComment`,
 * exactly as the two separate controls do — same checks, same audit rows, same
 * refusal to assign somebody who cannot open the ticket. A dispatch that wrote
 * the columns itself would be a second door into those rules.
 *
 * **The assignment decides the outcome, the note is beiwerk.** If the handover
 * note fails after the ticket has moved, the move stands and the failure is
 * reported — the alternative is an agent pressing the button again and a ticket
 * that bounces twice.
 */
export async function dispatchTicketAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  const raw = String(formData.get("assigneeId") ?? "");
  const assigneeId = raw === "" || raw === "__none" ? null : raw;
  const note = String(formData.get("note") ?? "").trim();

  try {
    assignTicket(ticketId, assigneeId, auth.user);
  } catch (error) {
    if (error instanceof TicketUpdateError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  let noteFailed: string | null = null;
  if (note) {
    try {
      // Internal, always. A handover note is machine-room talk about the
      // customer's ticket, not an answer to them — and "visible to the reporter"
      // is not something a dispatch dialog should be able to decide by accident.
      addComment(ticketId, auth.user, note, "internal", "text");
    } catch (error) {
      if (error instanceof CommentError) {
        noteFailed = error.message;
      } else {
        throw error;
      }
    }
  }

  revalidateTicket(ticketId);

  if (noteFailed) {
    return { ok: false, error: `Ticket zugewiesen, die Notiz nicht: ${noteFailed}` };
  }

  return {
    ok: true,
    message: assigneeId
      ? note
        ? "Ticket zugewiesen, Notiz hinterlegt."
        : "Ticket zugewiesen."
      : "Zuweisung aufgehoben.",
  };
}

/**
 * Replace the ticket's participant list.
 *
 * The whole list per submit, because that is what the chips in the mask are.
 *
 * `authorize` is called **without** the agent requirement, and that is not a
 * relaxation: `setTicketCc` decides, and it allows an agent or the reporter of
 * this ticket. Doing it there rather than here is what keeps the rule in one
 * place — `authorize(…, true)` would answer "Agenten vorbehalten" to a reporter
 * on their own ticket, which is the case this exists for.
 */
export async function setTicketCcAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, false);
  if (!auth.ok) return { ok: false, error: auth.error };

  // One address per line, so the field can be a textarea and a paste of a mail
  // header's recipient block works without anybody reformatting it.
  const emails = String(formData.get("emails") ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  let saved: MITSTicket;
  try {
    saved = setTicketCc(ticketId, emails, auth.user);
  } catch (error) {
    if (error instanceof TicketUpdateError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidateTicket(ticketId);

  return {
    ok: true,
    message:
      saved.cc_emails.length === 0
        ? "Keine Beteiligten mehr eingetragen."
        : `${saved.cc_emails.length} Beteiligte gespeichert.`,
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
  revalidateTicket(ticketId);

  return { ok: true, message: "Status geändert." };
}

/**
 * Dieses eine Ticket von der Verfallsautomatik ausnehmen — oder zurückholen.
 *
 * Die Entscheidung am Einzelfall neben den Fristen, die für alle gelten: „hier
 * warte ich bewusst länger" ist etwas, das der Agent weiß und die Einstellung
 * nicht. Agenten vorbehalten wie jeder Workflow-Schalter; ein Melder, der sein
 * Ticket aus der Aufräumregel nimmt, wäre eine Queue, die nie leer wird.
 */
export async function setTicketAutoCloseAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  // `on` ist, was ein Formular für einen gesetzten Haken schickt. Der Schalter
  // heißt „automatisch schließen", die Spalte speichert das Gegenteil — hier ist
  // die eine Stelle, die das dreht.
  const enabled = formData.get("autoClose") === "on";

  try {
    setTicketAutoClose(ticketId, enabled, auth.user);
  } catch (error) {
    if (error instanceof TicketUpdateError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidateTicket(ticketId);

  return {
    ok: true,
    message: enabled
      ? "Automatisches Schließen gilt wieder."
      : "Dieses Ticket schließt nicht automatisch.",
  };
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
  revalidateTicket(ticketId);

  return { ok: true, message: "Priorität geändert." };
}

/**
 * Re-file a ticket under a different category.
 *
 * Agents only. A reporter states a category on the way in — that is what the
 * intent tiles are — but correcting the queue afterwards is a decision about how
 * the desk is organised, and it moves the ticket out of somebody else's filter.
 *
 * The empty string clears it, and that is a real answer rather than a no-op: a
 * ticket wrongly filed is worse than one honestly unfiled, because only the
 * second shows up when somebody looks for what still needs sorting.
 */
export async function setTicketCategoryAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isFeatureEnabled("feature_ticket_categories")) {
    return { ok: false, error: "Kategorien sind abgeschaltet." };
  }

  const raw = String(formData.get("categoryId") ?? "").trim();
  const categoryId = raw === "" || raw === "__none" ? null : raw;

  try {
    setTicketCategory(ticketId, categoryId, auth.user);
  } catch (error) {
    if (error instanceof TicketUpdateError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidateTicket(ticketId);

  return {
    ok: true,
    message: categoryId ? "Kategorie geändert." : "Kategorie entfernt.",
  };
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
      undefined,
      /*
       * Die Ballbesitz-Automatik überspringen: dieser Knopf setzt den
       * Endzustand zwei Zeilen weiter unten selbst. Ohne das stünde in der
       * Historie `open → waiting_user → closed` für einen Vorgang, und die
       * mittlere Zeile hat nie jemand gesehen.
       */
      true,
    );
  } catch (error) {
    if (error instanceof CommentError) return { ok: false, error: error.message };
    unstable_rethrow(error);
    console.error("[MITS] addComment (Antworten & Schließen) fehlgeschlagen:", error);
    return {
      ok: false,
      error: "Der Beitrag konnte nicht gespeichert werden. Bitte erneut senden.",
    };
  }

  /*
   * Closing is part of the promise this button makes, so it is not best effort —
   * but it must not surface as a crash either. Reported honestly instead: the
   * reply is out, the status is not, and the agent can set it by hand.
   */
  try {
    setTicketStatus(ticketId, "closed", auth.user);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[MITS] Schließen nach Antwort fehlgeschlagen:", error);
    return {
      ok: false,
      error:
        "Die Antwort wurde gesendet, das Schließen hat aber nicht geklappt. Bitte den Status von Hand setzen.",
    };
  }

  // Everything past here happens after both writes; see the note in
  // `addCommentAction` for why none of it may fail the action.
  try {
    revalidateTicket(ticketId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[MITS] Revalidierung nach Antwort fehlgeschlagen:", error);
  }

  if (auth.ticket.created_by_email !== comment.author_email) {
    try {
      await sendNotification({
        to: auth.ticket.created_by_email,
        cc: auth.ticket.cc_emails,
        ...ticketReplyMail(
          auth.ticket,
          { author: comment.author_name, body: comment.body },
          ticketUrl(auth.ticket.id),
        ),
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error("[MITS] Benachrichtigungsmail fehlgeschlagen:", error);
    }
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
    // Anything else is a bug rather than a rejected input. Named in the log so
    // it can be found, then reported as an error the agent can act on instead of
    // taking the page down.
    unstable_rethrow(error);
    console.error("[MITS] addComment fehlgeschlagen:", error);
    return {
      ok: false,
      error: "Der Beitrag konnte nicht gespeichert werden. Bitte erneut senden.",
    };
  }

  /*
   * Everything past this point is *after* the message exists.
   *
   * That is the whole reason for the guard below. A throw here — a revalidation
   * against a path that changed, an SMTP host that resolves slowly, a template
   * that hits a field somebody removed — turns a reply that was written and
   * stored into "A server error occurred". The agent then sends it again, and the
   * ticket has it twice.
   *
   * So: the write decides the outcome, and the follow-up work is best effort.
   */
  try {
    revalidateTicket(ticketId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[MITS] Revalidierung nach Beitrag fehlgeschlagen:", error);
  }

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
    /*
     * `sendNotification` swallows a transport failure itself, but the two calls
     * around it do not: `ticketReplyMail` renders a template and `ticketUrl`
     * reads the SMTP settings. Neither has any business failing a reply that is
     * already in the database.
     */
    try {
      await sendNotification({
        to: auth.ticket.created_by_email,
        cc: auth.ticket.cc_emails,
        ...ticketReplyMail(
          auth.ticket,
          { author: comment.author_name, body: comment.body },
          ticketUrl(auth.ticket.id),
        ),
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error("[MITS] Benachrichtigungsmail fehlgeschlagen:", error);
    }
  }

  return {
    ok: true,
    message:
      visibility.data === "internal"
        ? "Interne Notiz gespeichert — für den Melder nicht sichtbar."
        : "Antwort gespeichert.",
  };
}

/* -- Correcting and taking back ------------------------------------------ */

/**
 * Change the text of a message you wrote.
 *
 * The module switch is checked here as well as being absent from the UI: a
 * disabled feature whose Server Function still answers is a disabled feature in
 * appearance only, and the Next docs are explicit that a Server Function is a
 * POST endpoint on whatever route it is used from.
 *
 * Ownership is not checked here — `editComment` does it against the stored row.
 * Doing it in both places would be two rules to keep in step, and the one further
 * from the database is the one that would drift.
 */
export async function editCommentAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, false);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isFeatureEnabled("feature_message_editing")) {
    return { ok: false, error: "Das nachträgliche Bearbeiten ist deaktiviert." };
  }

  try {
    editComment(
      String(formData.get("commentId") ?? ""),
      auth.user,
      String(formData.get("body") ?? ""),
    );
  } catch (error) {
    if (error instanceof CommentError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateTicket(ticketId);

  return { ok: true, message: "Beitrag geändert." };
}

/**
 * Take back the message you just sent.
 *
 * The fifteen-second window is enforced in `retractComment` against the stored
 * timestamp. Nothing here trusts the client's idea of how long ago it was — the
 * countdown in the browser is a courtesy, not the rule.
 */
export async function retractCommentAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, false);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isFeatureEnabled("feature_message_retract")) {
    return { ok: false, error: "Das Zurückziehen ist deaktiviert." };
  }

  try {
    retractComment(String(formData.get("commentId") ?? ""), auth.user);
  } catch (error) {
    if (error instanceof CommentError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateTicket(ticketId);

  return { ok: true, message: "Beitrag zurückgezogen." };
}

/**
 * The reporter withdraws their own ticket.
 *
 * Redirects rather than returning a result: the page it was called from no longer
 * exists once the ticket is gone, and leaving somebody on a 404 they caused by
 * pressing the button is a worse ending than landing on their list.
 */
export async function withdrawTicketAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, false);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    withdrawTicket(ticketId, auth.user);
  } catch (error) {
    if (error instanceof TrashError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/customer/tickets");
  revalidatePath("/mits");
  redirect("/customer/tickets");
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

  revalidateTicket(ticketId);

  /*
   * The mail goes out only for a macro that actually sent something, and only to
   * somebody other than the author — the same three conditions `addCommentAction`
   * checks, because this is the second path that can produce a public reply and
   * the reporter should not be able to tell which one was used.
   */
  if (outcome.sent && outcome.body && auth.ticket.created_by_email !== auth.user.email) {
    await sendNotification({
      to: auth.ticket.created_by_email,
      cc: auth.ticket.cc_emails,
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

/**
 * Answer one checklist step, or clear it.
 *
 * The step list comes from the ticket's own form schema, read here on the server:
 * the client sends an id and a value, never a definition. `setChecklistValue`
 * refuses an id the type does not declare and a value the step's kind does not
 * accept, which is what keeps a hand-built request from writing documentation for a
 * step nobody ever wrote.
 *
 * Only the two agent surfaces are revalidated. The reporter's page does not render
 * the panel, so refreshing it would be work for a view that cannot change.
 */
export async function setChecklistValueAction(
  _previous: TicketActionResult | null,
  formData: FormData,
): Promise<TicketActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const auth = await authorize(ticketId, true);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    setChecklistValue(
      ticketId,
      getFormSchema(auth.ticket.form_schema_id),
      String(formData.get("itemId") ?? ""),
      String(formData.get("value") ?? ""),
      auth.user,
    );
  } catch (error) {
    if (error instanceof ChecklistError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath(`/mits/tickets/${ticketId}/popout`);

  return { ok: true, message: "Checkliste aktualisiert." };
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
