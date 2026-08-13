"use client";

import { DownloadIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Attachments, larger.

   A screenshot in a reply is capped at `max-h-80` so one image cannot take the
   whole thread, which is right for reading and useless for the case the image was
   sent for: an error dialog whose text is the point. Clicking it now opens it at
   full size, with the download beside it.

   **Event delegation, because the markup is not ours to annotate.** A comment body
   is stored HTML rendered through `dangerouslySetInnerHTML` — there is no element
   here to hang an `onClick` on, and adding one would mean rewriting the stored
   markup on every render. A click handler on the wrapper sees the same events by
   bubbling, and it is the only approach that also covers a mailed-in message,
   whose markup this application never authored.

   What is recognised is deliberately narrow — an `<img>` or an `<a>` pointing at
   `/api/uploads/<id>`, nothing else:

   - Images open in place. There is no default action to lose.
   - A PDF opens in place too, and that is the reason the download route learned
     `?inline=1` for `application/pdf`.
   - **Every other file keeps its plain download.** A .docx or a .zip has no
     preview worth a modal, and intercepting the click to say so would replace a
     working download with a dialog that explains itself.

   Modified clicks are left alone throughout: Ctrl-click on an attachment still
   means "new tab" to the person who pressed it, and a viewer that swallows that is
   a viewer people work around.
   ────────────────────────────────────────────────────────────────────────── */

/** `/api/uploads/<id>`, with or without the inline flag. Nothing else. */
const UPLOAD_HREF = /^\/api\/uploads\/([A-Za-z0-9-]+)(?:\?inline=1)?$/;

interface Viewed {
  fileId: string;
  name: string;
  kind: "image" | "pdf";
}

/**
 * What this element would open, or `null` when it is not a previewable upload.
 *
 * Split out of the click handler so the keyboard path cannot drift from it. Two
 * copies of "is this a PDF" would be two answers to the question of which
 * attachments have a preview at all.
 */
function previewFor(element: Element): Viewed | null {
  const source =
    element instanceof HTMLImageElement
      ? element.getAttribute("src")
      : element.getAttribute("href");
  const fileId = source?.match(UPLOAD_HREF)?.[1];
  if (!fileId) return null;

  if (element instanceof HTMLImageElement) {
    return {
      fileId,
      // `alt` when the markup carries one — a mailed-in image usually does, an
      // inserted screenshot does not. The dialog needs a title either way.
      name: element.getAttribute("alt")?.trim() || "Bild",
      kind: "image",
    };
  }

  /*
   * A link's file type comes from its name, and the name is `title` when the
   * anchor carries one.
   *
   * `textContent` alone was wrong the moment an anchor held more than the file
   * name: the attachment strip in the opening bubble puts the size beside it, so
   * the text reads "bericht.pdf1,2 MB" and the `.pdf` test failed at the end of a
   * string that no longer ended there. The composer's own links carry no `title`
   * and keep falling through to the text, which is exactly the file name.
   *
   * Checked rather than assumed either way: everything that is not a PDF stays an
   * ordinary download, so a wrong guess here costs nothing.
   */
  const name =
    element.getAttribute("title")?.trim() ||
    element.textContent?.trim() ||
    "Datei";
  if (!/\.pdf$/i.test(name)) return null;
  return { fileId, name, kind: "pdf" };
}

export function AttachmentViewer({ children }: { children: ReactNode }) {
  const [viewed, setViewed] = useState<Viewed | null>(null);
  const container = useRef<HTMLDivElement>(null);

  /*
   * Upload images are given focus and a button role, because otherwise the preview
   * is mouse-only.
   *
   * The anchors need nothing: Enter on a focused `<a>` fires a click, which reaches
   * the delegated handler by bubbling like any other. A bare `<img>` is not
   * focusable at all, and images are exactly the case the viewer exists for — an
   * error dialog whose text is the point.
   *
   * Annotated in the DOM rather than in the markup, which is the same reason the
   * click handler is delegated: the body is stored HTML from `dangerouslySetInnerHTML`
   * and may have been written by a mail client. React does not manage children it
   * did not create, so these attributes survive its re-renders.
   *
   * No dependency list on purpose — new messages arrive by `router.refresh()`, and
   * there is no prop here that changes when they do. `data-previewable` keeps the
   * pass idempotent, so the cost per render is one `querySelectorAll` over a
   * message list.
   */
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    for (const image of root.querySelectorAll("img")) {
      if (image.dataset.previewable) continue;
      if (!previewFor(image)) continue;
      image.dataset.previewable = "1";
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute(
        "aria-label",
        `${image.getAttribute("alt")?.trim() || "Bild"} groß anzeigen`,
      );
    }
  });

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // Anything but a plain left click keeps the meaning the browser gives it.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    const element = target?.closest?.("img, a");
    if (!element) return;

    const preview = previewFor(element);
    if (!preview) return;

    event.preventDefault();
    setViewed(preview);
  };

  /*
   * Enter and Space on a focused image, which is the half the click handler cannot
   * reach.
   *
   * Anchors are deliberately absent: a browser turns Enter on a link into a click,
   * so they arrive at `onClick` already. Space is included because these images now
   * announce themselves as buttons, and Space is what a button answers to —
   * `preventDefault` stops it from scrolling the thread instead.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.defaultPrevented) return;

    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;

    const preview = previewFor(target);
    if (!preview) return;

    event.preventDefault();
    setViewed(preview);
  };

  return (
    <div ref={container} onClick={onClick} onKeyDown={onKeyDown}>
      {children}

      <Dialog
        open={viewed !== null}
        onOpenChange={(open) => {
          if (!open) setViewed(null);
        }}
      >
        {viewed && (
          /*
           * A bounded box, and the bound is the whole fix.
           *
           * `DialogContent` positions itself with `top-1/2 -translate-y-1/2` and
           * declares **no** max-height, so its height is whatever its children ask
           * for. The viewer asked for `75vh` and sat below a header inside `p-4`
           * with a `gap-4` — comfortably more than the viewport. The dialog then
           * grew past both edges of the screen: the PDF appeared at a size nobody
           * chose, and the close button was pushed into the download button beside
           * it because the row it shares had lost the space it was reserving.
           *
           * So the height is declared here and the regions divide it: a `shrink-0`
           * bar and a `min-h-0 flex-1` viewer. Same chain as `TicketFrame`, same
           * reason — a flex child does not shrink below its content without
           * `min-h-0`, and the viewer is the child that has to.
           */
          <DialogContent
            className={cn(
              "flex w-full flex-col gap-0 overflow-hidden rounded-3xl border border-border bg-card p-0 shadow-elev-3 sm:max-w-5xl",
              /*
               * A PDF gets a fixed height, an image a ceiling.
               *
               * The two need opposite things. A PDF viewer has no intrinsic size —
               * it fills whatever box it is given and scrolls inside it, so without
               * a declared height the box collapses to nothing. An image *has* one,
               * and a fixed height would frame a 300 px screenshot in a
               * three-quarter-screen panel of empty card.
               */
              viewed.kind === "pdf" ? "h-[92vh]" : "max-h-[92vh]",
            )}
          >
            {/*
              `pr-14` and not `pr-9`: the close button sits at `right-2` and is
              `size-8`, so it occupies the last 40 px of the row. The old reserve
              was 36 px — four pixels short before any of this, and invisible only
              because the title truncated first.
            */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border p-3 pr-14">
              <DialogTitle className="min-w-0 flex-1 truncate">
                {viewed.name}
              </DialogTitle>
              <Button
                asChild
                size="sm"
                className="h-8 shrink-0 rounded-full bg-surface-elevated px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {/*
                  Not a Next <Link>: this is a file response, not a route, and the
                  router would try to treat it as a navigation. Without
                  `?inline=1` the route answers with
                  `Content-Disposition: attachment`, so this is a download even
                  for the file shown above it.
                */}
                <a href={`/api/uploads/${viewed.fileId}`} download>
                  <DownloadIcon strokeWidth={1.5} />
                  Herunterladen
                </a>
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-card p-3">
              {viewed.kind === "image" ? (
                /*
                 * Plain <img>: next/image would want a configured loader for an
                 * authenticated route, and these are already size-bounded uploads.
                 *
                 * Capped in viewport units rather than with `h-full`. A percentage
                 * height resolves against a parent that has one, and this region
                 * deliberately does not — for an image the dialog sizes itself to
                 * the picture. `80vh` plus the bar and the padding stays under the
                 * dialog's own `92vh` ceiling, and the region scrolls on the short
                 * viewports where it does not.
                 */
                <img
                  src={`/api/uploads/${viewed.fileId}?inline=1`}
                  alt={viewed.name}
                  className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
                />
              ) : (
                /*
                 * The browser's own PDF viewer. Deliberately not a bundled one:
                 * pdf.js is a megabyte of JavaScript to reproduce something every
                 * target browser already ships, and it would still be reading the
                 * same route.
                 *
                 * **No `#view=` fragment.** It used to say `FitH`, which fits the
                 * page to the *width* of the frame — in a 64rem-wide box an A4
                 * portrait page becomes far taller than the frame, so what the
                 * reader gets is the top third of page one and a scrollbar. Every
                 * PDF these people open anywhere else uses their viewer's own
                 * default zoom; matching it is what "correctly scaled" means, and
                 * the fragment is interpreted differently by Chrome and by
                 * Firefox's pdf.js anyway.
                 */
                <iframe
                  src={`/api/uploads/${viewed.fileId}?inline=1`}
                  title={viewed.name}
                  className="size-full rounded-lg border border-border"
                />
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
