import sanitizeHtml from "sanitize-html";

/* ──────────────────────────────────────────────────────────────────────────
   HTML sanitising.

   Everything that will ever be rendered with `dangerouslySetInnerHTML` passes
   through here **before it is stored**, not on the way out. Cleaning on read means
   every future reader has to remember to do it; cleaning on write means the column
   only ever contains safe markup, and a render path that forgets is not a hole.

   **What guarantees the boundary is not this module's location.** It is that
   `addComment` is the only writer of the column and it always calls this before
   inserting. Deliberately *not* marked `server-only`: that marker would make the
   security-critical function untestable from the offline suite, and a sanitiser
   nobody can test is the worse trade. Calling it in a browser would prove nothing —
   the attacker controls the browser — so treat any client-side use as decoration.

   The allow-list is what the editor's toolbar can produce plus what an inbound mail
   plausibly contains. Anything else is dropped — not escaped, dropped, because a
   visible `<script>` in a ticket reply is noise either way.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Tags the editor toolbar produces, plus the ones a formatted mail brings along.
 *
 * No `<style>`, no `<iframe>`, no `<object>`, no `<form>`, no `<svg>`: each is a way
 * to execute or to phish inside our own origin. `<table>` is in because a mailed
 * reply frequently is one and dropping it would mangle the content.
 */
const ALLOWED_TAGS = [
  "p", "br", "div", "span",
  "strong", "b", "em", "i", "s", "u", "code", "pre",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr",
];

/**
 * Attributes, kept as narrow as the features need.
 *
 * No `style` anywhere: `style` alone is enough to cover the page with an invisible
 * clickable layer, and none of our own markup needs it. No `id` either — a
 * ticket-supplied id can collide with the app's own and break label/aria wiring.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

/**
 * Where an `<img>` may point.
 *
 * Only our own upload route. A remote image in a ticket is a tracking pixel that
 * reports back every time an agent opens the ticket — and with a mailed-in message
 * that is exactly what it usually is. Blocking the scheme means such an image
 * disappears instead of phoning home.
 *
 * `data:` is refused too: it would let a mail embed megabytes into a database column
 * and bypass the upload limits entirely.
 */
const UPLOAD_SRC = /^\/api\/uploads\/[A-Za-z0-9-]+(\?inline=1)?$/;

export interface SanitizeResult {
  html: string;
  /** True when an external or inline image was removed, so the UI can say so. */
  removedRemoteImages: boolean;
}

export function sanitizeRichText(input: string): SanitizeResult {
  let removedRemoteImages = false;

  const html = sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Links may only be things a browser can safely follow. This is what keeps
    // `javascript:` and `data:` out of an href.
    allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
    allowProtocolRelative: false,
    // Dropped with their content: keeping the text of a <script> would put the
    // source of an attack into the ticket as plain text for no benefit.
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // Every link leaves our origin as far as we know, so it opens detached.
          // `noopener` is the load-bearing half: without it the opened page can
          // navigate this tab via `window.opener`.
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      const src = frame.attribs.src ?? "";
      if (UPLOAD_SRC.test(src)) return false;
      removedRemoteImages = true;
      return true;
    },
  });

  return { html: html.trim(), removedRemoteImages };
}

/**
 * Whether the cleaned markup carries anything a reader would see.
 *
 * Checked after sanitising, not before: a body consisting only of a remote tracking
 * pixel sanitises down to nothing, and storing that as a reply would show an empty
 * bubble. The text content plus any surviving image is the test.
 */
export function hasVisibleContent(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .trim() !== "";
}

/**
 * The upload ids an already-sanitised body references.
 *
 * Read back out of our own markup rather than tracked alongside it: the editor may
 * insert an image and the author may then delete it again, so the document is the
 * only thing that knows what actually survived. Safe to regex because the source has
 * been through `sanitizeRichText` — every `src` that reached this point matched
 * `UPLOAD_SRC`, so the shape is known.
 *
 * **Links count as well as images**, because a reply can now carry a file the
 * browser cannot render inline — a PDF or a log — and those are inserted as an
 * `<a>` rather than an `<img>`. Missing them would leave the row unbound to the
 * ticket, and `openUploadFor` would then answer 404 for everybody except the
 * author and the agents: the reporter would see a link to their own ticket's
 * attachment that refuses to open.
 */
export function uploadIdsInHtml(html: string): string[] {
  const ids = new Set<string>();
  for (const pattern of [
    /<img[^>]*src="[/]api[/]uploads[/]([A-Za-z0-9-]+)([?]inline=1)?"/gi,
    /<a[^>]*href="[/]api[/]uploads[/]([A-Za-z0-9-]+)([?]inline=1)?"/gi,
  ]) {
    for (const match of html.matchAll(pattern)) {
      ids.add(match[1]);
    }
  }
  return [...ids];
}
