import { requireApiUser } from "@/lib/auth/session";
import { openUploadFor } from "@/lib/storage";
import { getTicketFor } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   Attachment download.

   Access is decided per request: the owner, a agent/admin working the board,
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
  let upload;
  try {
    upload = await openUploadFor(
      fileId,
      user,
      (ticketId) => getTicketFor(ticketId, user) !== null,
    );
  } catch (error) {
    /*
     * A backend that is unreachable or misconfigured is not "not found".
     *
     * Answering 404 here would tell an agent the attachment is gone when the real
     * problem is an expired S3 key, and somebody would go looking for a deleted
     * file. 502 plus a log line points at the actual cause. The message is
     * deliberately generic — a signing error's text names the bucket.
     */
    console.error("[MITS] Anhang konnte nicht geöffnet werden:", error);
    return Response.json(
      { error: "Der Dateispeicher ist nicht erreichbar." },
      { status: 502 },
    );
  }

  if (!upload) {
    return Response.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  /*
   * `?inline=1` renders in place instead of downloading — needed for the images in
   * a FAQ article, which have to appear in an <img> rather than as a link, and for
   * the attachment viewer in a ticket thread, which shows a screenshot or a PDF at
   * full size instead of making somebody download it to read one line.
   *
   * Honoured only for raster images and PDF, and that restriction is what makes it
   * safe: the storage allow-list contains no SVG and no HTML, so nothing that can
   * carry script into this origin is reachable through this branch. A PDF renders
   * in the browser's own viewer, which cannot reach the embedding document.
   * `nosniff` plus the stored Content-Type — taken from the extension, never from
   * the browser — keeps a mislabelled file from being reinterpreted. Everything
   * else stays a download, so the request cannot opt a document into inline
   * rendering.
   */
  const inline =
    upload.inlineViewable &&
    new URL(request.url).searchParams.get("inline") === "1";

  const filename = `filename*=UTF-8''${encodeURIComponent(upload.name)}`;

  // Awaited: the S3 backend resolves its stream from a network response.
  return new Response(await upload.stream(), {
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
