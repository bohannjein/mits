import { cleanInboundReply, isQuoteMarkerLine } from "@/lib/mail/quotes";
import { TICKET_NUMBER_DIGITS } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Deciding what an arriving mail *is*, before anything is written.

   Pure on purpose, like `incident-rule.ts` and for the same reason: the expensive
   mistakes here are silent in both directions. Failing to recognise a reply opens
   a duplicate ticket and splits the conversation; recognising one that is not a
   reply appends a stranger's message to somebody else's ticket. Neither shows up
   as an error anywhere.

   The caller does the writing. This decides.
   ────────────────────────────────────────────────────────────────────────── */

/** What a transport hands over, whichever one it was. */
export interface InboundMail {
  /** Transport-native id, so a message can be marked handled afterwards. */
  uid: string;
  from: string;
  fromName: string;
  subject: string;
  /** Plain-text body as the client sent it, before quote stripping. */
  text: string;
  /** Original HTML body, if any. Sanitised by the caller, never trusted here. */
  html: string;
  /** `Message-ID`, for the loop check. */
  messageId: string;
  /** `In-Reply-To` plus `References`, already split. */
  references: string[];
  receivedAt: Date;
}

/**
 * Very small HTML-to-text pass, for the Graph transport.
 *
 * Not a renderer and not a sanitiser: the result feeds quote stripping and the
 * stored plain-text body, while the *displayed* version goes through
 * `sanitizeRichText` like everything else. Block-level tags become newlines so
 * `stripQuotedReply` can still find a marker at the start of a line — without
 * that, an HTML mail collapses into one line and no quote is ever detected.
 *
 * Here rather than beside the transport that needs it, for the reason this whole
 * module exists: `services/mail-inbound.ts` is `server-only` and pulls in an IMAP
 * client, which puts it out of reach of the offline suite. This is the function
 * where a missed `<br>` silently disables quote detection for every HTML mail.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    // Blank line between blocks, not a single newline. Paragraph separation is
    // what several of the quote markers key on — "Am … schrieb …:" is recognised
    // as its own line, and an HTML mail whose paragraphs ran together would hide
    // it inside a longer one.
    .replace(/<\/(p|div|blockquote|h[1-6])>/gi, "\n\n")
    .replace(/<\/(tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The ticket number a subject refers to, or null.
 *
 * Outgoing mail puts the padded number in brackets — `[0000000000001042] Neue
 * Antwort: …` — so this is the reverse of `mail-templates.ts`. Brackets are what
 * make it safe to match: a bare sixteen-digit run could be an order number or an
 * IBAN fragment somebody pasted, and appending their mail to whichever ticket that
 * happened to hit is the worse of the two failure modes.
 *
 * Shorter runs are accepted inside the brackets too, because a person forwarding
 * a thread sometimes retypes `[1042]`.
 */
export function ticketNumberFromSubject(subject: string): number | null {
  const match = subject.match(
    new RegExp(`\\[\\s*#?(\\d{1,${TICKET_NUMBER_DIGITS}})\\s*\\]`),
  );
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Strip the reply and forward prefixes a subject collects.
 *
 * Only used for the *title* of a new ticket. German and English, repeated —
 * "AW: Re: WG: Drucker" is what a three-hop thread actually looks like.
 */
export function cleanSubject(subject: string): string {
  let text = subject.trim();
  let previous: string;
  do {
    previous = text;
    text = text
      .replace(/^\s*(re|aw|antw|fwd?|wg|weiterleitung)\s*(\[\d+\])?\s*:\s*/i, "")
      .trim();
  } while (text !== previous && text !== "");

  return text;
}

/**
 * Mail we must not turn into a ticket.
 *
 * An auto-reply loop is the classic way a helpdesk floods its own queue: MITS
 * mails a confirmation, the customer's out-of-office answers it, MITS opens a
 * ticket for the out-of-office and mails a confirmation for *that*. The headers
 * below are the standard ways a machine says "do not reply to me", and honouring
 * them is cheaper than noticing the loop afterwards.
 */
export function isAutomatedMail(headers: Record<string, string>): boolean {
  const get = (name: string) => (headers[name.toLowerCase()] ?? "").toLowerCase();

  if (get("auto-submitted") !== "" && get("auto-submitted") !== "no") return true;
  if (get("x-auto-response-suppress") !== "") return true;
  if (get("precedence") === "bulk" || get("precedence") === "auto_reply") return true;
  if (get("list-id") !== "" || get("list-unsubscribe") !== "") return true;
  // Exchange and Notes both set this on an out-of-office.
  if (get("x-autoreply") !== "" || get("x-autorespond") !== "") return true;

  return false;
}

export type IngestPlan =
  | { kind: "skip"; reason: string }
  | { kind: "reply"; ticketNumber: number; body: string }
  | { kind: "ticket"; title: string; body: string };

/** Length ceiling, matching what `addComment` will accept. */
const MAX_BODY = 20_000;

/**
 * What the sender actually typed in a reply.
 *
 * `cleanInboundReply` deliberately keeps a message whose *first* line is a quote
 * marker — that rule is right for a forward, where cutting at line zero would
 * leave nothing at all. It is wrong here: a reply consisting only of a quote comes
 * back as the bare header line, and posting "Am 01.08. schrieb IT
 * <it@firma.de>:" as the customer's answer is worse than posting nothing.
 *
 * So the surviving quote headers are dropped afterwards. Only whole lines that
 * *are* markers, never anything below them — the ordinary case has already been
 * trimmed by `cleanInboundReply`, and cutting further here would risk taking a
 * real sentence with it.
 */
function replyBody(text: string): string {
  return cleanInboundReply(text)
    .split("\n")
    .filter((line) => !isQuoteMarkerLine(line))
    .join("\n")
    .trim()
    .slice(0, MAX_BODY);
}

/**
 * What to do with one message.
 *
 * The reply branch keys on the subject alone. `References` would be the more
 * correct signal, but it requires storing the `Message-ID` of every mail MITS
 * sends and matching against it — a table this build does not have. The bracketed
 * number is in every subject MITS produces and survives the round trip through
 * every client that was tested, which is why it is what outgoing mail carries.
 *
 * A reply whose body cleans down to nothing becomes a skip rather than an empty
 * comment: somebody answered with only a quote or only a signature, and an empty
 * bubble in the thread tells the agent less than no bubble at all.
 */
export function planIngest(
  mail: InboundMail,
  headers: Record<string, string> = {},
): IngestPlan {
  if (isAutomatedMail(headers)) {
    return { kind: "skip", reason: "Automatische Antwort (Auto-Submitted)." };
  }
  if (mail.from.trim() === "") {
    return { kind: "skip", reason: "Ohne Absender." };
  }

  const body = replyBody(mail.text);
  const ticketNumber = ticketNumberFromSubject(mail.subject);

  if (ticketNumber !== null) {
    if (body === "") {
      return { kind: "skip", reason: "Antwort ohne eigenen Text." };
    }
    return { kind: "reply", ticketNumber, body };
  }

  /*
   * A new ticket keeps the *untrimmed* body.
   *
   * Quote stripping is right for a reply, where the quote is a copy of something
   * already in the thread. On a first message there is nothing to duplicate, and a
   * forwarded mail — which is mostly quote — would be cut down to the two words
   * somebody typed above it.
   */
  const full = mail.text.trim().slice(0, MAX_BODY);
  const title = cleanSubject(mail.subject) || "Meldung per E-Mail";

  if (full === "") {
    return { kind: "skip", reason: "Leere Nachricht." };
  }

  return { kind: "ticket", title: title.slice(0, 160), body: full };
}
