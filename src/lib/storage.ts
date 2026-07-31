import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, createReadStream, existsSync, statSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { dataDir } from "@/lib/auth/secret";
import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   Disk-backed attachment storage.

   Blobs go into <data dir>/uploads, which is the mounted Docker volume, so they
   survive a rebuild alongside the database. The client never learns a path: it
   gets an opaque id, and every read goes through an access check.
   ────────────────────────────────────────────────────────────────────────── */

/** 10 MB per file. Raise deliberately — this also bounds a single request body. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOADS_PER_REQUEST = 5;

/**
 * Extensions we are willing to store, mapped to the type we serve them as.
 *
 * An allow-list rather than a deny-list: the interesting attachments in an IT
 * ticket are screenshots, logs and PDFs, and everything is served as a download
 * anyway, so there is no reason to accept arbitrary types.
 */
const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export class UploadError extends Error {}

/**
 * What a stored file is for, and therefore who may read it.
 *
 * - `ticket`: the owner and staff, unchanged.
 * - `faq`: anyone signed in — a help article whose screenshots only its author can
 *   open is not a help article.
 *
 * Set once, at insert. There is deliberately no function that changes it: promoting
 * an existing row to `faq` would publish somebody else's ticket attachment to every
 * user of the instance, and it would do so without anything on screen changing.
 * A file becomes a FAQ attachment by being uploaded as one.
 */
export type UploadScope = "ticket" | "faq";

/** Images we are willing to render inline rather than only offer as a download. */
const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

export const isInlineImage = (type: string): boolean =>
  INLINE_IMAGE_TYPES.has(type);

export interface StoredUpload {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface UploadRow {
  id: string;
  owner_id: string;
  ticket_id: string | null;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  scope: UploadScope;
}

function uploadsDir(): string {
  const dir = join(dataDir(), "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Strip everything but a plain file name, then keep only the extension.
 *
 * The stored name is generated, never derived from the upload, so a name like
 * `../../server.js` cannot escape the uploads directory. The original is kept in
 * the database purely for display.
 */
function safeExtension(originalName: string): string {
  const name = basename(originalName.replace(/\\/g, "/"));
  const extension = extname(name).toLowerCase();
  if (!(extension in ALLOWED_EXTENSIONS)) {
    throw new UploadError(
      `Dateityp „${extension || "ohne Endung"}“ ist nicht erlaubt.`,
    );
  }
  return extension;
}

/** Display name for the database: printable characters only, bounded length. */
function displayName(originalName: string): string {
  const name = [...basename(originalName.replace(/\\/g, "/"))]
    // Drop control characters and DEL: they would end up in a
    // Content-Disposition header verbatim.
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return (name || "datei").slice(0, 180);
}

/** Persist one uploaded file and return what the payload should reference. */
export async function storeUpload(
  file: File,
  user: SessionUser,
  /** Who will be allowed to read it. Defaults to the narrower rule. */
  scope: UploadScope = "ticket",
): Promise<StoredUpload> {
  if (file.size === 0) throw new UploadError("Die Datei ist leer.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `„${displayName(file.name)}“ ist größer als ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const extension = safeExtension(file.name);
  const id = randomUUID();
  const storedName = `${id}${extension}`;
  const target = join(uploadsDir(), storedName);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the extension, not the browser-supplied Content-Type: the type is only
  // ever used for a download response, never to execute anything.
  const mimeType = ALLOWED_EXTENSIONS[extension];

  await writeFile(target, bytes, { flag: "wx" });

  const row: UploadRow = {
    id,
    owner_id: user.id,
    ticket_id: null,
    original_name: displayName(file.name),
    stored_name: storedName,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    created_at: new Date().toISOString(),
    scope,
  };

  try {
    db.prepare(
      `INSERT INTO mits_upload
         (id, owner_id, ticket_id, original_name, stored_name, mime_type,
          size_bytes, created_at, scope)
       VALUES
         (@id, @owner_id, @ticket_id, @original_name, @stored_name, @mime_type,
          @size_bytes, @created_at, @scope)`,
    ).run(row);
  } catch (error) {
    // Do not leave a blob behind that nothing points at.
    try {
      unlinkSync(target);
    } catch {
      /* best effort */
    }
    throw error;
  }

  return {
    id,
    name: row.original_name,
    size: row.size_bytes,
    type: row.mime_type,
    url: `/api/uploads/${id}`,
  };
}

export interface ReadableUpload {
  name: string;
  type: string;
  size: number;
  /** Safe to render in an <img>. Everything else is download-only. */
  inlineImage: boolean;
  stream: () => ReadableStream<Uint8Array>;
}

/**
 * Open an upload for download, or return null when it does not exist **or** the
 * user may not read it. Same answer for both, so ids cannot be probed.
 *
 * A ticket attachment is readable by its owner and by technicians and admins — they
 * work the tickets these files belong to. A FAQ attachment is readable by anyone
 * signed in, which is the whole point of publishing it.
 */
export function openUploadFor(
  id: string,
  user: SessionUser,
): ReadableUpload | null {
  const row = db.prepare("SELECT * FROM mits_upload WHERE id = ?").get(id) as
    | UploadRow
    | undefined;
  if (!row) return null;

  // Checked in this order so the FAQ case never depends on ownership: an admin
  // publishes an article, and a reporter who was never near it can still read the
  // attachment.
  const readable =
    row.scope === "faq" ||
    row.owner_id === user.id ||
    canViewBoard(user.role);
  if (!readable) return null;

  const directory = uploadsDir();
  const path = resolve(join(directory, row.stored_name));
  // Belt and braces: the stored name is generated, but a hand-edited database row
  // must not be able to read outside the uploads directory either.
  if (!path.startsWith(resolve(directory))) return null;
  if (!existsSync(path) || !statSync(path).isFile()) return null;

  return {
    name: row.original_name,
    type: row.mime_type,
    size: row.size_bytes,
    inlineImage: isInlineImage(row.mime_type),
    stream: () =>
      // Node stream -> web stream; Next serves the latter directly. Streaming
      // rather than reading into memory keeps a 10 MB download off the heap.
      Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
  };
}

/**
 * Which of these ids are not usable as FAQ attachments.
 *
 * Referencing a ticket attachment from an article would not expose it — the row's
 * `scope` decides who may read it, not who points at it, so the download would
 * still 404. What it would produce is a published article with a dead attachment,
 * which nobody notices until a reporter clicks it. Rejecting the save instead puts
 * the error in front of the admin who caused it.
 */
export function unusableFaqAttachments(fileIds: string[]): string[] {
  if (fileIds.length === 0) return [];

  const select = db.prepare(
    "SELECT scope FROM mits_upload WHERE id = ?",
  );

  return fileIds.filter((id) => {
    const row = select.get(id) as { scope: UploadScope } | undefined;
    return !row || row.scope !== "faq";
  });
}

/**
 * Attach uploads to a ticket, verifying that the caller owns every one of them.
 *
 * Without this check a user could reference a colleague's `fileId` in their own
 * payload and pull the file through the board view later.
 */
export function linkUploadsToTicket(
  fileIds: string[],
  ticketId: string,
  user: SessionUser,
): void {
  if (fileIds.length === 0) return;

  const select = db.prepare(
    "SELECT id, owner_id, ticket_id FROM mits_upload WHERE id = ?",
  );
  const update = db.prepare("UPDATE mits_upload SET ticket_id = ? WHERE id = ?");

  const link = db.transaction((ids: string[]) => {
    for (const id of ids) {
      const row = select.get(id) as
        | { id: string; owner_id: string; ticket_id: string | null }
        | undefined;
      if (!row || row.owner_id !== user.id) {
        throw new UploadError("Ein Anhang gehört nicht zu diesem Konto.");
      }
      if (row.ticket_id && row.ticket_id !== ticketId) {
        throw new UploadError("Ein Anhang hängt bereits an einem anderen Ticket.");
      }
      update.run(ticketId, id);
    }
  });

  link(fileIds);
}
