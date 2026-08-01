import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

import { htmlToText, type InboundMail } from "@/lib/mail/inbound-parse";
import {
  MAIL_FETCH_LIMIT,
  isMailInboundConfigured,
  type MailSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Fetching from the support mailbox.

   Two transports behind one function. Both answer with `InboundMail[]` plus a way
   to acknowledge, and nothing above this file knows which one is configured —
   that is what let the decision logic in `inbound-parse.ts` stay pure and
   testable, and it is why adding a third transport later is a new branch here
   rather than an edit to the ingest.

   **Acknowledge only after the ticket exists.** Both transports return the
   messages *and* a callback; `lib/mail/ingest.ts` calls it per message after the
   write succeeded. Marking the mailbox first would be simpler and would lose a
   customer's message whenever the database write failed — the mail is then read,
   the ticket does not exist, and nothing anywhere says a message was dropped.

   **MIME is not parsed by hand.** `mailparser` handles multipart, quoted-printable,
   base64 and the charset zoo; hand-rolling that is how a helpdesk ends up
   displaying `=C3=A4` to its customers.
   ────────────────────────────────────────────────────────────────────────── */

export class MailInboundError extends Error {}

export interface FetchedMail {
  mail: InboundMail;
  /** Raw headers, lowercased, for the auto-reply check. */
  headers: Record<string, string>;
}

export interface InboxBatch {
  messages: FetchedMail[];
  /** Mark one message handled. Called after the ticket or comment was written. */
  acknowledge: (uid: string) => Promise<void>;
  /** Released when the batch is done. A no-op for the stateless Graph transport. */
  close: () => Promise<void>;
}

/** Header values `mailparser` hands back as objects rather than strings. */
function flattenHeaders(parsed: ParsedMail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of parsed.headers) {
    out[name.toLowerCase()] =
      typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

function toInboundMail(parsed: ParsedMail, uid: string): InboundMail {
  const sender = parsed.from?.value?.[0];

  return {
    uid,
    from: (sender?.address ?? "").toLowerCase(),
    fromName: sender?.name?.trim() || sender?.address || "",
    subject: parsed.subject ?? "",
    // `text` rather than `textAsHtml`: the plan works on plain text, and the
    // original HTML is kept separately for the caller to sanitise.
    text: parsed.text ?? "",
    html: typeof parsed.html === "string" ? parsed.html : "",
    messageId: parsed.messageId ?? "",
    references: Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [],
    receivedAt: parsed.date ?? new Date(),
  };
}

/* ── IMAP ───────────────────────────────────────────────────────────────── */

async function fetchViaImap(settings: MailSettings): Promise<InboxBatch> {
  const client = new ImapFlow({
    host: settings.imapHost.trim(),
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: { user: settings.imapUser.trim(), pass: settings.imapPassword },
    // The library logs every protocol line at info level otherwise, which puts
    // the mailbox password's surrounding conversation into the container log.
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock(settings.imapMailbox.trim() || "INBOX");
  const messages: FetchedMail[] = [];

  try {
    /*
     * Unseen only. The `\Seen` flag is the queue: MITS sets it after a message has
     * produced a ticket, so a run that crashes halfway re-reads exactly what it
     * did not finish. It also means an agent who reads a mail in Outlook first
     * takes it out of MITS's view — surprising, and still better than the
     * alternative of a separate high-water mark that drifts from the mailbox.
     */
    const found = await client.search({ seen: false }, { uid: true });
    // `search` answers `false` when the mailbox rejects the query rather than
    // throwing. Treated as "nothing to do" — the alternative is a `.slice` on a
    // boolean, which is the shape this guard exists to prevent.
    const batch = Array.isArray(found) ? found.slice(0, MAIL_FETCH_LIMIT) : [];

    for (const uid of batch) {
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) continue;

      const parsed = await simpleParser(message.source);
      messages.push({
        mail: toInboundMail(parsed, String(uid)),
        headers: flattenHeaders(parsed),
      });
    }
  } finally {
    lock.release();
  }

  return {
    messages,
    acknowledge: async (uid) => {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    },
    close: async () => {
      await client.logout().catch(() => client.close());
    },
  };
}

/* ── Microsoft Graph ────────────────────────────────────────────────────── */

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  internetMessageId?: string;
  receivedDateTime?: string;
  internetMessageHeaders?: { name: string; value: string }[];
}

/**
 * Client-credentials token.
 *
 * Not cached. A token lives an hour and a poll runs every few minutes at most, so
 * caching would save one request in twenty and would need invalidation logic for
 * a rotated secret — the failure mode being an instance that keeps using a
 * credential the admin has already revoked.
 */
async function graphToken(settings: MailSettings): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(settings.graphTenantId.trim())}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.graphClientId.trim(),
        client_secret: settings.graphClientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error_description?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    /*
     * Azure's `error_description` names the actual problem — wrong tenant, expired
     * secret, missing admin consent — and it is the difference between a fixable
     * message and "HTTP 401". It does not contain the secret.
     */
    throw new MailInboundError(
      payload?.error_description ?? `Token-Anforderung fehlgeschlagen (HTTP ${response.status}).`,
    );
  }

  return payload.access_token;
}

async function fetchViaGraph(settings: MailSettings): Promise<InboxBatch> {
  const token = await graphToken(settings);
  const mailbox = encodeURIComponent(settings.graphMailbox.trim());

  const url =
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages` +
    `?$filter=isRead eq false&$top=${MAIL_FETCH_LIMIT}&$orderby=receivedDateTime asc` +
    `&$select=id,subject,body,from,internetMessageId,receivedDateTime,internetMessageHeaders`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new MailInboundError(
      `Graph-Abruf fehlgeschlagen (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
    );
  }

  const payload = (await response.json()) as { value?: GraphMessage[] };
  const messages: FetchedMail[] = [];

  for (const item of payload.value ?? []) {
    const headers: Record<string, string> = {};
    for (const header of item.internetMessageHeaders ?? []) {
      headers[header.name.toLowerCase()] = header.value;
    }

    /*
     * Graph hands back either HTML or text depending on the message, and there is
     * no `Prefer: outlook.body-content-type` that reliably converts. Running the
     * HTML through `simpleParser` would not help — it parses MIME, not markup — so
     * the tags are stripped here for the plain-text half and the original is kept
     * for the sanitiser.
     */
    const raw = item.body?.content ?? "";
    const isHtml = (item.body?.contentType ?? "").toLowerCase() === "html";

    messages.push({
      headers,
      mail: {
        uid: item.id,
        from: (item.from?.emailAddress?.address ?? "").toLowerCase(),
        fromName:
          item.from?.emailAddress?.name?.trim() ||
          item.from?.emailAddress?.address ||
          "",
        subject: item.subject ?? "",
        text: isHtml ? htmlToText(raw) : raw,
        html: isHtml ? raw : "",
        messageId: item.internetMessageId ?? "",
        references: [],
        receivedAt: item.receivedDateTime
          ? new Date(item.receivedDateTime)
          : new Date(),
      },
    });
  }

  return {
    messages,
    acknowledge: async (id) => {
      const patch = await fetch(
        `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isRead: true }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!patch.ok) {
        // Loud, because the consequence is a message that gets ingested again on
        // the next run — a duplicate ticket, which looks like a MITS bug.
        throw new MailInboundError(
          `Nachricht konnte nicht als gelesen markiert werden (HTTP ${patch.status}).`,
        );
      }
    },
    close: async () => {},
  };
}

/**
 * Fetch from whichever transport is configured.
 *
 * Refuses rather than returning nothing when the configuration is incomplete: an
 * empty batch and a broken mailbox look identical from the outside, and the
 * difference is exactly what the admin pressing "abrufen" needs to know.
 */
export async function fetchInbox(settings: MailSettings): Promise<InboxBatch> {
  if (settings.transport === "none") {
    throw new MailInboundError("Kein Abruf konfiguriert.");
  }
  if (!isMailInboundConfigured(settings)) {
    throw new MailInboundError(
      "Der Postfach-Zugang ist unvollständig — bitte Zugangsdaten und Auffang-Konto prüfen.",
    );
  }

  return settings.transport === "imap"
    ? fetchViaImap(settings)
    : fetchViaGraph(settings);
}
