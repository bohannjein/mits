import { getSessionUserFor } from "@/lib/auth/session";
import { openUploadFor } from "@/lib/storage";

/* ──────────────────────────────────────────────────────────────────────────
   Attachment download.

   Access is decided per request: the owner, or a technician/admin working the
   board. A file that exists but belongs to someone else answers 404, identical to
   a file that never existed, so ids cannot be probed.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await getSessionUserFor(request);
  if (!user) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { fileId } = await params;
  const upload = openUploadFor(fileId, user);
  if (!upload) {
    return Response.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  return new Response(upload.stream(), {
    headers: {
      "Content-Type": upload.type,
      "Content-Length": String(upload.size),
      // Always a download, never rendered in place: an uploaded SVG or HTML file
      // served inline would execute in the app's own origin.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
      "X-Content-Type-Options": "nosniff",
      // Attachments are per-user; a shared cache must not hand them to anyone else.
      "Cache-Control": "private, no-store",
    },
  });
}
