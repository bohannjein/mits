import { requireApiUser } from "@/lib/auth/session";
import {
  MAX_UPLOADS_PER_REQUEST,
  uploadLimitBytes,
  UploadError,
  storeUpload,
} from "@/lib/storage";

/* ──────────────────────────────────────────────────────────────────────────
   Attachment upload.

   Multipart, because the payload is a binary file. The response is what the
   ticket payload should carry: an opaque id and a download path. The caller never
   sees a filesystem path.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Erwartet wird ein multipart/form-data-Upload." },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "Keine Datei empfangen." }, { status: 400 });
  }
  if (files.length > MAX_UPLOADS_PER_REQUEST) {
    return Response.json(
      { error: `Höchstens ${MAX_UPLOADS_PER_REQUEST} Dateien pro Upload.` },
      { status: 400 },
    );
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > uploadLimitBytes() * MAX_UPLOADS_PER_REQUEST) {
    return Response.json({ error: "Upload ist insgesamt zu groß." }, { status: 413 });
  }

  const stored = [];
  try {
    for (const file of files) {
      stored.push(await storeUpload(file, user));
    }
  } catch (error) {
    if (error instanceof UploadError) {
      // 415 for a rejected type, 413 for a rejected size — the message says which.
      return Response.json({ error: error.message }, { status: 415 });
    }
    throw error;
  }

  return Response.json({ uploads: stored }, { status: 201 });
}
