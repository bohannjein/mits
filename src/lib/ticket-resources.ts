/* ──────────────────────────────────────────────────────────────────────────
   Everything shared in a ticket, gathered in one place.

   Two kinds of thing scattered through a long conversation: files somebody
   attached and links somebody pasted. Both are findable by scrolling the thread,
   which is exactly the problem — "the installer he sent on Tuesday" is four
   screens up in a thread that has grown since, and the person looking for it has
   to read past everything else to get there.

   **No `server-only`.** `collectLinks` is pure string work over comment bodies and
   is covered by the offline suite; the extraction is the part with quiet failure
   modes, so it is the part that is tested. The file half lives in the page, which
   already has the upload rows.
   ────────────────────────────────────────────────────────────────────────── */

export interface SharedLink {
  href: string;
  /** The visible text, or the host when the link was pasted bare. */
  label: string;
  /** Who put it there, for the list. */
  author: string;
  createdAt: Date;
}

/**
 * Only what a browser can safely follow.
 *
 * The same rule as `isSafeResourceHref` for the portal tiles, and it matters more
 * here: these come out of message bodies, which is the one place in MITS where
 * text from outside the organisation ends up rendered as a list of things to
 * click. `mailto` and `tel` are in because a support thread is full of them.
 */
const SAFE_SCHEME = /^(https?|mailto|tel):/i;

/** Bare URLs in plain text. Deliberately conservative about the trailing edge. */
const BARE_URL = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/**
 * `href="…"` in a sanitised body, with the link text that follows it.
 *
 * `[\s\S]*?` rather than `.` with the `s` flag: the flag needs an ES2018 target
 * and this module is also compiled for the offline suite. The character class
 * does the same job in every target.
 */
const ANCHOR = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * A readable label for a bare URL.
 *
 * The host plus the last path segment, which is what distinguishes two links to
 * the same wiki. The full address is on the element as a title; a list of
 * hundred-character URLs is a list nobody scans.
 */
function labelFor(href: string): string {
  try {
    const url = new URL(href);
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last ? `${url.host}/${decodeURIComponent(last)}` : url.host;
  } catch {
    return href;
  }
}

/** Markup out, entities back, whitespace collapsed. */
function plainLabel(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the links out of a conversation, newest occurrence last, no duplicates.
 *
 * **Deduplicated by href**, keeping the *first* mention: a link that was posted
 * once and then quoted back three times is one resource, and the first mention is
 * the one whose author and timestamp mean something.
 *
 * Inline images are skipped. They are attachments, they already appear in the
 * file half of the panel, and listing every embedded screenshot as a "link" would
 * bury the two links somebody is actually looking for.
 */
export function collectLinks(
  messages: {
    body: string;
    body_format: string;
    author_name: string;
    created_at: Date;
  }[],
): SharedLink[] {
  const found = new Map<string, SharedLink>();

  const add = (href: string, label: string, message: (typeof messages)[number]) => {
    const trimmed = href.trim();
    if (!SAFE_SCHEME.test(trimmed)) return;
    if (found.has(trimmed)) return;
    found.set(trimmed, {
      href: trimmed,
      label: label.trim() || labelFor(trimmed),
      author: message.author_name,
      createdAt: message.created_at,
    });
  };

  for (const message of messages) {
    if (message.body_format === "html") {
      for (const match of message.body.matchAll(ANCHOR)) {
        add(match[1], plainLabel(match[2]), message);
      }
      /*
       * Plain URLs inside HTML too. The rich editor autolinks what it recognises,
       * but a pasted address that it did not becomes text inside a paragraph —
       * and to the reader it is still the link they are looking for.
       */
      for (const match of plainLabel(message.body).matchAll(BARE_URL)) {
        add(match[0], "", message);
      }
      continue;
    }

    for (const match of message.body.matchAll(BARE_URL)) {
      add(match[0], "", message);
    }
  }

  return [...found.values()];
}
