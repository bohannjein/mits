import { requireApiUser } from "@/lib/auth/session";
import { openUploadFor } from "@/lib/storage";
import { getTicketFor } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   Attachment download.

   Access is decided per request: the owner, a technician/admin working the board,
   or anyone signed in when the file was published as a FAQ attachment. A file that
   exists but is not readable answers 404, identical to a file that never existed,
   so ids cannot be probed.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const { fileId } = await params;
  /*
   * The participant check is supplied here, not imported by the storage module —
   * that would close an import cycle. See `openUploadFor`.
   */
  const upload = openUploadFor(
    fileId,
    user,
    (ticketId) => getTicketFor(ticketId, user) !== null,
  );
  if (!upload) {
    return Response.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  /*
   * `?inline=1` renders in place instead of downloading — needed for the images in
   * a FAQ article, which have to appear in an <img> rather than as a link.
   *
   * Honoured only for raster images, and that restriction is what makes it safe:
   * the storage allow-list contains no SVG and no HTML, so nothing that can carry
   * script is reachable through this branch. `nosniff` plus the stored
   * Content-Type — taken from the extension, never from the browser — keeps a
   * mislabelled file from being reinterpreted. Everything else stays a download,
   * so the request cannot opt a document into inline rendering.
   */
  const inline =
    upload.inlineImage &&
    new URL(request.url).searchParams.get("inline") === "1";

  const filename = `filename*=UTF-8''${encodeURIComponent(upload.name)}`;

  return new Response(upload.stream(), {
    headers: {
      "Content-Type": upload.type,
      "Content-Length": String(upload.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; ${filename}`,
      "X-Content-Type-Options": "nosniff",
      // Attachments are per-user; a shared cache must not hand them to anyone else.
      "Cache-Control": "private, no-store",
    },
  });
}
