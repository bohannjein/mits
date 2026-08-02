import { cn } from "@/lib/utils";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One comment's body, in whichever format it was stored.

   Shared by the agent chat and the reporter's thread, because both lists contain
   both kinds: an agent reply written in the rich-text editor is sanitised HTML, a
   reporter reply and everything written before the editor existed is plain text.

   `dangerouslySetInnerHTML` is safe here for a specific reason, not a general one:
   `addComment` is the only writer of this column and it runs `sanitizeRichText` —
   a server-side allow-list — before inserting anything marked `html`. The column
   therefore cannot hold markup this application did not clean. Text rows are rendered
   as text, so a literal `<b>` typed by a reporter stays literal instead of becoming
   formatting.
   ────────────────────────────────────────────────────────────────────────── */

/** Shared with the editor, so a reply looks the same while written and after. */
/*
 * Nothing in here may decide how wide the bubble is.
 *
 * A mailed-in reply routinely contains a hundred-character tracking URL or an
 * address with no spaces in it, and a single unbreakable token is enough to
 * widen the bubble, widen the column and give the whole conversation a
 * horizontal scrollbar. `break-words` lets the browser break inside such a token
 * as a last resort; `pre` and `table` keep their own scrollbars below, because
 * breaking a code block mid-token changes what it says.
 */
const RICH_TEXT_CLASSES = cn(
  "break-words",
  "[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-medium [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-medium [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  /*
   * `cursor-zoom-in` because the image is one: `AttachmentViewer` wraps the thread
   * and opens an embedded screenshot at full size. The cap above is what makes that
   * necessary — an error dialog scaled to 320 pixels is an attachment nobody can
   * read, and lifting the cap instead would let one image take the whole thread.
   */
  "[&_img]:my-2 [&_img]:max-h-80 [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_img]:border [&_img]:border-border",
  // Wide content scrolls inside itself rather than widening the bubble.
  "[&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
);

export function CommentBody({ comment }: { comment: TicketComment }) {
  if (comment.body_format === "html") {
    return (
      <div
        className={cn("mt-2 text-sm leading-relaxed", RICH_TEXT_CLASSES)}
        dangerouslySetInnerHTML={{ __html: comment.body }}
      />
    );
  }

  return (
    <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
      {comment.body}
    </p>
  );
}
