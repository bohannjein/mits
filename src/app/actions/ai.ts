"use server";

import { revalidatePath } from "next/cache";

import { canViewBoard } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getAISettings } from "@/lib/ai-settings";
import {
  ClusterError,
  dismissCluster,
  parkedChildren,
  promoteToMajorIncident,
} from "@/lib/services/ai/clustering";
import { AIProviderError } from "@/lib/services/ai/provider";
import {
  SummaryError,
  summariseTicket,
  type TicketSummary,
} from "@/lib/services/ai/summary";
import { addComment, CommentError, listCommentsFor } from "@/lib/ticket-comments";
import { getTicketFor, setTicketStatus } from "@/lib/tickets";
import { isAIFeatureOn } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The three AI actions an agent can trigger.

   Every one re-reads the session, re-checks the role and re-checks the feature
   toggle. A Server Function is reachable as a POST to whatever route it is used
   from, so being rendered inside an agent-only panel behind a switched-on toggle
   proves nothing about the caller — and "the module is off" has to be enforced
   where the work happens, not where the button is drawn.
   ────────────────────────────────────────────────────────────────────────── */

export type AIActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function requireAgent(): Promise<
  { ok: true; user: Awaited<ReturnType<typeof requireUser>> } | { ok: false; error: string }
> {
  const user = await requireUser("/mits");
  if (!canViewBoard(user.role)) {
    return { ok: false, error: "Diese Aktion ist Agenten vorbehalten." };
  }
  return { ok: true, user };
}

/* ── Major incidents ────────────────────────────────────────────────────── */

export async function dismissClusterAction(
  _previous: AIActionResult | null,
  formData: FormData,
): Promise<AIActionResult> {
  const auth = await requireAgent();
  if (!auth.ok) return auth;

  const ids = String(formData.get("ticketIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) return { ok: false, error: "Nichts zum Ausblenden." };

  dismissCluster(ids);
  revalidatePath("/mits");

  /*
   * Said out loud, because the behaviour is not what "Ignorieren" usually means:
   * the group comes back as soon as somebody reports the same thing again. That is
   * deliberate — a growing outage is worth mentioning twice — and an agent who
   * expected it gone forever would otherwise think the button failed.
   */
  return {
    ok: true,
    message:
      "Ausgeblendet. Meldet jemand dasselbe Problem erneut, erscheint der Hinweis wieder.",
  };
}

export async function createMajorIncidentAction(
  _previous: AIActionResult | null,
  formData: FormData,
): Promise<AIActionResult> {
  const auth = await requireAgent();
  if (!auth.ok) return auth;

  if (!isAIFeatureOn(getAISettings(), "clustering")) {
    return { ok: false, error: "Die Hauptstörungs-Erkennung ist abgeschaltet." };
  }

  const ids = String(formData.get("ticketIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    const created = promoteToMajorIncident(
      String(formData.get("title") ?? ""),
      ids,
      auth.user,
    );

    revalidatePath("/mits");
    revalidatePath("/customer/tickets");

    return {
      ok: true,
      message: `Hauptstörung ${created.number} angelegt, ${created.children} Ticket(s) zugeordnet.`,
    };
  } catch (error) {
    if (error instanceof ClusterError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Close everything parked behind a resolved major incident.
 *
 * The reply text is written by the agent and posted to each child as a public
 * comment. Not a template MITS invents: this goes to every affected customer at
 * once, and the one message that reaches the most people is the last one that
 * should be machine-worded.
 *
 * No notification mail per child. `addComment` is called directly rather than
 * through `addCommentAction`, so the SMTP path is not entered — twenty customers
 * receiving a mail in the same second from the same outage is a mail server
 * problem, and they have the ticket.
 */
export async function resolveChildTicketsAction(
  _previous: AIActionResult | null,
  formData: FormData,
): Promise<AIActionResult> {
  const auth = await requireAgent();
  if (!auth.ok) return auth;

  const parentId = String(formData.get("ticketId") ?? "");
  const parent = getTicketFor(parentId, auth.user);
  if (!parent) return { ok: false, error: "Ticket nicht gefunden." };
  if (!parent.major_incident) {
    return { ok: false, error: "Das ist keine Hauptstörung." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body === "") {
    return { ok: false, error: "Bitte eine Sammelantwort formulieren." };
  }

  const children = parkedChildren(parentId);
  if (children.length === 0) {
    return { ok: false, error: "Keine wartenden Tickets mehr." };
  }

  let closed = 0;
  const failed: string[] = [];

  for (const child of children) {
    try {
      addComment(child.id, auth.user, body, "public", "text");
      setTicketStatus(child.id, "resolved", auth.user);
      closed += 1;
      revalidatePath(`/customer/tickets/${child.id}`);
      revalidatePath(`/mits/tickets/${child.id}`);
    } catch (error) {
      /*
       * One failure does not stop the rest. Twenty customers waiting on an outage
       * that has been fixed should not stay waiting because the nineteenth ticket
       * had a problem — and the report names which ones were missed.
       */
      failed.push(child.number);
      if (!(error instanceof CommentError)) {
        console.error("[MITS] Sammelantwort fehlgeschlagen:", error);
      }
    }
  }

  revalidatePath(`/mits/tickets/${parentId}`);
  revalidatePath("/mits");

  return {
    ok: true,
    message:
      failed.length === 0
        ? `${closed} Ticket(s) beantwortet und auf „Gelöst“ gesetzt.`
        : `${closed} Ticket(s) erledigt. Nicht geklappt hat es bei: ${failed.join(", ")}.`,
  };
}

/* ── Summary ────────────────────────────────────────────────────────────── */

export type SummaryActionResult =
  | { ok: true; summary: TicketSummary }
  | { ok: false; error: string };

export async function summariseTicketAction(
  _previous: SummaryActionResult | null,
  formData: FormData,
): Promise<SummaryActionResult> {
  const auth = await requireAgent();
  if (!auth.ok) return { ok: false, error: auth.error };

  const ticketId = String(formData.get("ticketId") ?? "");
  const ticket = getTicketFor(ticketId, auth.user);
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };

  try {
    // Internal notes are in the transcript, which is why this action is
    // agent-only twice over: the role check above, and `listCommentsFor` filtering
    // in SQL for anybody who is not staff.
    const summary = await summariseTicket(
      ticket,
      listCommentsFor(ticketId, auth.user),
    );
    return { ok: true, summary };
  } catch (error) {
    if (error instanceof SummaryError || error instanceof AIProviderError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
