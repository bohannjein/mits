import { requireApiRole } from "@/lib/auth/session";
import {
  MAX_UPLOADS_PER_REQUEST,
  uploadLimitBytes,
  UploadError,
  storeUpload,
} from "@/lib/storage";

/* ──────────────────────────────────────────────────────────────────────────
   FAQ attachment upload.

   A separate endpoint from the ticket one, and admin-only, because the files it
   writes carry `scope: "faq"` — readable by every signed-in user. Publishing is a
   deliberate act, so it needs its own door rather than a flag on the existing one:
   a `?scope=faq` parameter on the ticket endpoint would let any reporter publish
   their own file to the whole instance.

   There is no counterpart that re-scopes an existing upload. A file becomes a FAQ
   attachment by being uploaded here; the alternative would mean an admin could
   point a FAQ article at a colleague's ticket attachment and publish it.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const auth = await requireApiRole("admin", request);
  if ("response" in auth) return auth.response;

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
      stored.push(await storeUpload(file, auth.user, "faq"));
    }
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 415 });
    }
    throw error;
  }

  return Response.json({ uploads: stored }, { status: 201 });
}
