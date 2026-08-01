/* ──────────────────────────────────────────────────────────────────────────
   Trimming a reply down to what the person actually wrote.

   Pure text work, so it is fully testable — and it needs to be, because both failure
   modes are silent. Cutting too eagerly loses the answer and the ticket shows an empty
   reply; cutting too little appends the entire thread to every message and the
   conversation becomes unreadable after three exchanges.

   Deliberately conservative: when no marker is found, nothing is removed. A mail that
   keeps its quote is untidy, a mail that lost its content is a support call.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Lines that mean "everything below is the previous message".
 *
 * German and English, because a tenant's clients are mixed. Anchored to the line start
 * so the same words inside a sentence do not cut the message in half.
 */
const QUOTE_MARKERS = [
  // Outlook and Exchange, both locales.
  /^-{2,}\s*(original message|urspr[üu]ngliche nachricht)\s*-{2,}\s*$/i,
  /^\s*(von|from|gesendet|sent|betreff|subject|an|to)\s*:\s*.+$/i,
  /*
   * Gmail and most mobile clients. The sender sits *after* the verb in both locales —
   * "Am 1. August schrieb IT <it@firma.de>:" — so the pattern cannot expect the line to
   * end at the verb. The trailing colon is what keeps it from matching ordinary prose
   * that happens to start with "Am".
   */
  /^\s*(am|on)\s+.{4,80}\s+(schrieb|wrote)\b.*:\s*$/i,
  /^\s*.{0,80}\s+(schrieb am|wrote on)\s+.+:\s*$/i,
  // Generic "write above this line" banners some helpdesks add.
  /^\s*[-=_]{5,}\s*$/,
];

/**
 * Whether this single line is a quote header.
 *
 * Exported so `planIngest` can ask the question without owning a second copy of
 * the patterns. It needs it because `stripQuotedReply` deliberately keeps a
 * message whose *first* line is a marker — right for a forward becoming a new
 * ticket, wrong for a reply that is nothing but a quote, where the result is a
 * bubble containing only "Am 01.08. schrieb IT <it@firma.de>:".
 */
export const isQuoteMarkerLine = (line: string): boolean =>
  QUOTE_MARKERS.some((marker) => marker.test(line));

/** Lines that begin a signature. Everything after is dropped. */
const SIGNATURE_MARKERS = [
  // RFC 3676: exactly "-- " on its own line. The trailing space is the standard, but
  // clients strip trailing whitespace often enough that both forms are accepted.
  /^--\s?$/,
  /^\s*(mit freundlichen gr[üu][ßs]en|freundliche gr[üu][ßs]e|beste gr[üu][ßs]e)\b/i,
  /^\s*(kind regards|best regards|regards|sincerely|thanks|thank you)\s*,?\s*$/i,
  /^\s*(gesendet von mein|sent from my|von meinem)\b/i,
  /^\s*(diese e-?mail|this e-?mail|diese nachricht)\b.*\b(vertraulich|confidential)\b/i,
];

/**
 * The part of a reply the sender typed.
 *
 * Quote first, then signature, because a signature usually sits above the quote and
 * cutting the quote first leaves less text to search. The result is trimmed of blank
 * lines at both ends; an all-whitespace result comes back as the empty string so the
 * caller can decide rather than store a blank reply.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const quoteAt = findFirst(lines, (line) =>
    QUOTE_MARKERS.some((marker) => marker.test(line)),
  );

  /*
   * A quote marker on the very first line means the mail is nothing but a quote — a
   * bare forward, say. Cutting there would leave nothing, so the text is kept whole
   * and the caller sees what actually arrived.
   */
  const kept = quoteAt > 0 ? lines.slice(0, quoteAt) : lines;

  const signatureAt = findFirst(kept, (line) =>
    SIGNATURE_MARKERS.some((marker) => marker.test(line)),
  );
  const body = signatureAt > 0 ? kept.slice(0, signatureAt) : kept;

  return body
    .filter((line, index, all) => {
      // Drop leading and trailing blank lines, keep the ones in between.
      if (line.trim() !== "") return true;
      const before = all.slice(0, index).some((entry) => entry.trim() !== "");
      const after = all.slice(index + 1).some((entry) => entry.trim() !== "");
      return before && after;
    })
    .join("\n")
    .trim();
}

/**
 * `>`-prefixed quoting, which some clients use instead of a header block.
 *
 * Applied after `stripQuotedReply` rather than inside it: a line starting with `>` is
 * not a marker for "everything below", so removing the lines individually is the only
 * correct handling.
 */
export function stripQuotePrefixes(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .trim();
}

/** Both passes, which is what an inbound reply wants. */
export const cleanInboundReply = (text: string): string =>
  stripQuotePrefixes(stripQuotedReply(text));

function findFirst(lines: string[], test: (line: string) => boolean): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (test(lines[index])) return index;
  }
  return -1;
}
