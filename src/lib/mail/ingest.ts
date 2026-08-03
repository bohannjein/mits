import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { getMailSettings, incidentRuleConfig } from "@/lib/mail-settings";
import { planIngest, sameMailbox } from "@/lib/mail/inbound-parse";
import { planSecurityIncident } from "@/lib/mail/incident-rule";
import { ticketCreatedMail } from "@/lib/mail-templates";
import { fetchInbox, MailInboundError } from "@/lib/services/mail-inbound";
import { sendNotification, ticketUrl } from "@/lib/smtp";
import { getSystemTimezone } from "@/lib/system-settings";
import { addComment, CommentError } from "@/lib/ticket-comments";
import {
  assignTicket,
  createTicket,
  getTicketByNumberFor,
  setTicketPriority,
} from "@/lib/tickets";
import { asSessionUser, findUser, findUserByEmail } from "@/lib/users";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import { formatTicketNumber, type MITSTicket } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Turning fetched mail into tickets and replies.

   The decisions live in `inbound-parse.ts` and are pure; the transports live in
   `services/mail-inbound.ts`; this file is the dull part that writes. Dull is the
   point — everything interesting is somewhere it can be exercised without a
   mailbox.

   Three rules that are not obvious:

   **Ownership never comes from the message.** A sender MITS recognises gets their
   own ticket. A sender it does not is filed under the admin-configured fallback
   account with their address kept as the reporter, so replies route back to a
   human while visibility stays with an account somebody actually controls. No
   account is ever created by an unauthenticated message.

   **A message is acknowledged only after its write succeeded.** Marking the
   mailbox first is simpler and loses a customer's mail whenever the database write
   fails: the message is read, no ticket exists, and nothing says one was dropped.

   **A reply to a ticket the sender may not see becomes a new ticket.** Not an
   error and not an append: `getTicketByNumberFor` answers null for both "gone" and
   "not yours", and appending on the strength of a number in a subject line would
   let anybody who guesses one write into a stranger's conversation.

   That check is per *account*, which is not enough for a sender who has none — the
   account is then the fallback, and the fallback is staff. A foreign sender must
   additionally be the reporter of the ticket they answer (`sameMailbox` against
   `created_by_email`); see `applyReply`.
   ────────────────────────────────────────────────────────────────────────── */

export interface IngestReport {
  fetched: number;
  created: number;
  replied: number;
  skipped: number;
  /** One line per message that did not become anything, for the admin mask. */
  notes: string[];
}

/**
 * Fetch and file everything waiting in the mailbox.
 *
 * Returns a report rather than throwing on a per-message problem: one malformed
 * mail must not stop the other twenty-four, and an admin pressing "abrufen" needs
 * to see which ones were skipped and why. A *transport* failure does throw — that
 * is one problem, not twenty-five, and the caller says so.
 */
export async function ingestMailbox(): Promise<IngestReport> {
  const settings = getMailSettings();
  const report: IngestReport = {
    fetched: 0,
    created: 0,
    replied: 0,
    skipped: 0,
    notes: [],
  };

  const fallbackAccount = settings.fallbackUserId
    ? findUser(settings.fallbackUserId)
    : null;
  if (!fallbackAccount) {
    throw new MailInboundError(
      "Kein Auffang-Konto hinterlegt. Ohne eines kann eine Mail von einer unbekannten Adresse niemandem zugeordnet werden.",
    );
  }

  const batch = await fetchInbox(settings);
  report.fetched = batch.messages.length;

  try {
    for (const { mail, headers } of batch.messages) {
      const plan = planIngest(mail, headers);

      if (plan.kind === "skip") {
        report.skipped += 1;
        report.notes.push(`${mail.subject || "(ohne Betreff)"}: ${plan.reason}`);
        // Acknowledged anyway. A message that will never become a ticket — an
        // out-of-office, an empty reply — would otherwise be re-examined on every
        // single run, forever.
        await batch.acknowledge(mail.uid).catch(() => {});
        continue;
      }

      /*
       * The sender's own account if they have one, the fallback otherwise. Only
       * the fallback path needs the display overrides, which is why they are
       * conditional rather than always passed: a mail from a known colleague
       * should look exactly like a ticket they filed in the portal.
       */
      const senderAccount = findUserByEmail(mail.from);
      const actor = asSessionUser(senderAccount ?? fallbackAccount);
      const foreign = senderAccount === null;

      try {
        if (plan.kind === "reply") {
          const handled = await applyReply(
            plan.ticketNumber,
            plan.body,
            mail,
            actor,
            foreign,
            report,
          );
          if (handled) {
            report.replied += 1;
          } else {
            /*
             * The number pointed at nothing this sender may see, or at a ticket
             * somebody else reported. Filed as a new ticket rather than dropped:
             * the customer wrote to support and is owed an answer, and the
             * alternative is a message that disappears.
             */
            await openTicket(plan.body, mail, actor, foreign, report);
          }
        } else {
          await openTicket(plan.body, mail, actor, foreign, report, plan.title);
        }

        await batch.acknowledge(mail.uid);
      } catch (error) {
        /*
         * Deliberately *not* acknowledged. The message stays unread and the next
         * run tries again — which is the right behaviour for a transient database
         * or SMTP problem, and merely noisy for a permanent one.
         */
        report.skipped += 1;
        report.notes.push(
          `${mail.subject || "(ohne Betreff)"}: ${
            error instanceof Error ? error.message : "Unbekannter Fehler"
          } — bleibt ungelesen und wird erneut versucht.`,
        );
      }
    }
  } finally {
    await batch.close().catch(() => {});
  }

  return report;
}

/**
 * Append a mailed reply to its ticket, or report that it does not apply.
 *
 * Returns false rather than throwing when the ticket is not visible to the sender:
 * that is not an error, it is the access rule, and the caller turns it into a new
 * ticket.
 */
async function applyReply(
  ticketNumber: number,
  body: string,
  mail: { from: string; fromName: string },
  actor: SessionUser,
  foreign: boolean,
  report: IngestReport,
): Promise<boolean> {
  const ticket = getTicketByNumberFor(ticketNumber, actor);
  if (!ticket) return false;

  /*
   * A sender without an account has to be the reporter of the ticket they answer.
   *
   * `getTicketByNumberFor` asks "may this *account* see the ticket", and for a
   * foreign sender the account is the fallback — which is staff, so the answer is
   * yes for every ticket in the instance. The question that matters here is a
   * different one: did this *mailbox* write this ticket. Two questions, and the
   * second only exists in the ingest, which is why it is answered here rather than
   * pushed into the query.
   *
   * Without it the bracketed number is the whole authentication, and it is not a
   * secret: numbers count up from 1, `[42]` is accepted, and `From` is trivially
   * forged. A mail could append a public comment to a stranger's ticket under any
   * name it liked.
   *
   * A mismatch is not dropped — the caller files it as a new ticket. Somebody wrote
   * to support and is owed an answer; what they are not owed is write access to a
   * conversation that is not theirs.
   */
  if (foreign && !sameMailbox(mail.from, ticket.created_by_email)) {
    report.notes.push(
      `${formatTicketNumber(ticket.ticket_number)}: Antwort kam von ${
        mail.from || "einer leeren Adresse"
      } und nicht von der Melderadresse — nicht angehängt.`,
    );
    return false;
  }

  try {
    addComment(
      ticket.id,
      actor,
      body,
      // Public, always. A mailed message is by definition something the customer
      // said out loud; storing it as an internal note would hide the reporter's
      // own words from the reporter.
      "public",
      "text",
      foreign ? { name: mail.fromName || mail.from, email: mail.from } : undefined,
    );
  } catch (error) {
    if (error instanceof CommentError) {
      // An empty or over-long body. Not retried — the next run would fail the
      // same way, so the caller acknowledges and records it.
      throw new MailInboundError(error.message);
    }
    throw error;
  }

  return true;
}

/** File a new ticket, applying the Defender rule if it recognises the message. */
async function openTicket(
  body: string,
  mail: { from: string; fromName: string; subject: string; html: string },
  actor: SessionUser,
  foreign: boolean,
  report: IngestReport,
  title?: string,
): Promise<void> {
  const origin = foreign ? { reporterEmail: mail.from } : undefined;
  const author = foreign
    ? { name: mail.fromName || mail.from, email: mail.from }
    : undefined;

  /*
   * The Defender rule gets first refusal, exactly as it does for the admin's test
   * view — same function, same configuration. Reusing it here rather than
   * reimplementing the classification is what keeps "what the test page shows" and
   * "what the mailbox actually does" the same thing.
   */
  const incident = planSecurityIncident(
    { from: mail.from, subject: mail.subject, text: body },
    incidentRuleConfig(),
  );

  let ticket: MITSTicket;

  if (incident) {
    ticket = createTicket(
      {
        // `email`, so the detail page knows the sender's message is already a
        // stored comment and must not be synthesised on top of it.
        source: "email",
        form_schema_id: incident.formSchemaId,
        payload: incident.payload,
        priority: incident.priority,
        location_id: null,
      },
      actor,
      origin,
    );

    // The rule's reasoning, as the first internal note. Internal because it is
    // machine reasoning about the customer's message, not an answer to them.
    addComment(
      ticket.id,
      actor,
      incident.reasons.join("\n"),
      "internal",
      "text",
    );

    if (incident.assignTo) {
      assignTicket(ticket.id, incident.assignTo, actor);
    }
    // Re-applied after the audit-writing mutators, so the recorded history reads
    // in the order things actually happened.
    setTicketPriority(ticket.id, incident.priority, actor);
  } else {
    ticket = createTicket(
      {
        source: "email",
        form_schema_id: QUICK_TICKET_SCHEMA.id,
        payload: {
          title: (title ?? mail.subject ?? "Meldung per E-Mail").slice(0, 120),
          // The quick-ticket schema demands twenty characters. A two-word mail is
          // a real thing customers send, so it is padded with the sender rather
          // than rejected — losing the message over a form constraint the sender
          // never saw would be absurd.
          description:
            body.length >= 20 ? body : `${body}\n\n(Per E-Mail von ${mail.from})`,
          attachments: [],
        },
        priority: "medium",
        location_id: null,
      },
      actor,
      origin,
    );
  }

  /*
   * The customer's message also opens the conversation.
   *
   * It is in the payload too, and that duplication is deliberate rather than an
   * oversight. The payload's `description` is the *record*: plain text, what
   * `searchTickets` and the AI triage read. The comment is the *message*: rendered
   * as sanitised HTML when the mail carried any, so a table or a bulleted list
   * arrives looking like what the sender wrote.
   *
   * Without it, an agent opening a mailed ticket finds an empty thread and a
   * flattened wall of text in the sidebar, and every reply they write is the first
   * bubble in a conversation whose opening line is somewhere else on the page.
   *
   * A failure here is swallowed: the ticket exists and is answerable, and losing
   * it to a rejected comment would be the worse outcome. The body is already in
   * the payload either way.
   */
  try {
    addComment(
      ticket.id,
      actor,
      mail.html || body,
      "public",
      mail.html ? "html" : "text",
      author,
    );
  } catch (error) {
    report.notes.push(
      `${formatTicketNumber(ticket.ticket_number)}: Nachricht konnte nicht als Beitrag abgelegt werden (${
        error instanceof Error ? error.message : "unbekannt"
      }). Der Text steht in den Angaben.`,
    );
  }

  report.created += 1;

  /*
   * The confirmation mail, to the human — the same one the API sends on a portal
   * submission, so a customer who wrote in gets the ticket number they will need
   * to reply against.
   *
   * Awaited and allowed to fail quietly: `sendNotification` swallows its own
   * errors, and a ticket that exists without a confirmation is far better than a
   * mail loop or a lost message.
   */
  await sendNotification({
    to: ticket.created_by_email,
    ...ticketCreatedMail(ticket, ticketUrl(ticket.id), getSystemTimezone()),
  });

  report.notes.push(
    `${formatTicketNumber(ticket.ticket_number)} angelegt aus „${mail.subject || "ohne Betreff"}“.`,
  );
}
