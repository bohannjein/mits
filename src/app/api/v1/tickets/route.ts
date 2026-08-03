import { z } from "zod";

import { bearerToken, verifyApiKey } from "@/lib/api-keys";
import { API_TOKEN_HEADER, isValidApiToken } from "@/lib/api-tokens";
import { attachCIToTicket, findCIBySerial } from "@/lib/cmdb";
import { getMailSettings } from "@/lib/mail-settings";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import {
  TicketValidationError,
  createTicket,
  setTicketPriority,
} from "@/lib/tickets";
import { asSessionUser, findUser, findUserByEmail } from "@/lib/users";
import { TicketPriority, formatTicketNumber } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/v1/tickets — file a ticket from a machine.

   For monitoring and automation: Zabbix sees a host go down and opens the
   ticket itself, with the serial number it already knows, instead of waiting
   for somebody to notice the mail.

   Authorization is a named API key (`Authorization: Bearer mits_live_…`), or
   the older shared instance token. No session path: this endpoint only writes,
   and there is no reason to open it in a browser.

   **The ticket belongs to a real account.** `reporterEmail` is looked up, never
   created — an unauthenticated call must not be able to bring an account into
   existence. An unknown address files under the same fallback account the mail
   ingest uses and keeps the address as the reply target, which is exactly the
   situation a mail from a stranger produces.

   **Priority is set after the insert, deliberately.** `createTicket` clamps a
   reporter's draft to `medium` — the rule that stops a customer from filing
   everything as critical. That rule is right and stays; a monitoring alert is
   not a customer, so the requested priority is applied as a second, audited
   step, the same way the mail ingest applies its Defender rule.
   ────────────────────────────────────────────────────────────────────────── */

const InboundTicket = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(1).max(4000),
  /** `HIGH`, `high`, `hoch` — anything the priority enum knows, in any case. */
  priority: z.string().trim().max(32).optional(),
  reporterEmail: z.string().trim().max(320).optional(),
  /** Matched against `mits_configuration_item.serial_number`. */
  assetSerialNumber: z.string().trim().max(120).optional(),
});

function unauthorized(): Response {
  return Response.json(
    { error: "Kein gültiger API-Key." },
    {
      status: 401,
      // Named so a caller with a broken config sees which scheme is expected
      // rather than guessing from a bare 401.
      headers: { "WWW-Authenticate": 'Bearer realm="MITS"' },
    },
  );
}

export async function POST(request: Request) {
  const key = verifyApiKey(bearerToken(request.headers.get("authorization")));
  const legacyToken = isValidApiToken(request.headers.get(API_TOKEN_HEADER));
  if (!key && !legacyToken) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body ist kein JSON." }, { status: 400 });
  }

  const parsed = InboundTicket.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Payload ist unvollständig.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  const input = parsed.data;

  /*
   * The sender's own account if the address is known, the mail fallback
   * otherwise. Shared with the ingest on purpose: an instance that has decided
   * where nameless mail lands has already answered this question, and a second
   * setting for the same decision is a second thing to get wrong.
   */
  const senderAccount = input.reporterEmail
    ? findUserByEmail(input.reporterEmail)
    : null;
  const fallbackId = getMailSettings().fallbackUserId.trim();
  const account = senderAccount ?? (fallbackId ? findUser(fallbackId) : null);

  if (!account) {
    return Response.json(
      {
        error:
          "Kein Auffang-Konto hinterlegt. Ohne eines lässt sich ein Ticket von einer unbekannten Adresse niemandem zuordnen.",
      },
      { status: 409 },
    );
  }

  const actor = asSessionUser(account);

  // Unknown values fall back rather than reject. A monitoring system that sends
  // "SEVERE" should get a ticket at the default priority, not a 422 that ends
  // with nobody being told the server is down.
  const priority =
    TicketPriority.safeParse(input.priority?.toLowerCase()).data ?? "medium";

  let ticket;
  try {
    ticket = createTicket(
      {
        source: "legacy",
        form_schema_id: QUICK_TICKET_SCHEMA.id,
        payload: {
          title: input.title,
          /*
           * The quick-ticket schema demands twenty characters. "Host down" is a
           * real alert, so it is padded with its own origin rather than
           * rejected — losing the message over a form constraint the sender
           * never saw would be absurd. Same call as the mail ingest.
           */
          description:
            input.description.length >= 20
              ? input.description
              : `${input.description}\n\n(Automatisch gemeldet${
                  key ? ` von ${key.name}` : ""
                })`,
          attachments: [],
        },
        priority,
        location_id: null,
      },
      actor,
      // Same meaning as for a mail from a stranger: the account owns the
      // ticket, this address is who to answer. Only when MITS does not know the
      // address — otherwise it is already the account's own.
      senderAccount || !input.reporterEmail
        ? undefined
        : { reporterEmail: input.reporterEmail },
    );
  } catch (error) {
    if (error instanceof TicketValidationError) {
      return Response.json(
        { error: error.message, issues: error.issues },
        { status: 422 },
      );
    }
    throw error;
  }

  if (ticket.priority !== priority) {
    ticket = setTicketPriority(ticket.id, priority, actor);
  }

  /*
   * The asset link is reported, never fatal. A serial that matches nothing is
   * the normal state of an inventory that is not perfectly maintained, and
   * throwing the ticket away over it would lose the alert to keep the CMDB
   * tidy.
   */
  let asset: { id: string; name: string } | null = null;
  if (input.assetSerialNumber) {
    const item = findCIBySerial(input.assetSerialNumber);
    if (item) {
      attachCIToTicket(ticket.id, item.id, actor.id);
      asset = { id: item.id, name: item.name };
    }
  }

  return Response.json(
    {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      ticket_label: formatTicketNumber(ticket.ticket_number),
      status: ticket.status,
      priority: ticket.priority,
      asset,
      asset_matched: input.assetSerialNumber ? asset !== null : null,
    },
    { status: 201 },
  );
}
