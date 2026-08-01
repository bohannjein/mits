import "server-only";

import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { maxUploadBytes } from "@/lib/data-settings";
import { db } from "@/lib/db/sqlite";
import { isFeatureEnabled } from "@/lib/features";
import {
  activeBackend,
  readObject,
  removeObject,
  writeObject,
} from "@/lib/services/storage";
import type { StorageBackend } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Attachment storage — the rules half.

   This module owns *who may read what*, which extensions exist and how an upload
   binds to a ticket. Where the bytes physically go is `lib/services/storage.ts`:
   the mounted data directory, or an S3-compatible bucket.

   The split is what let S3 arrive as a new file instead of as edits threaded
   through the access checks. Nothing below cares which backend is in use; it
   records the one that was used and hands it back on read.

   The client never learns a path either way: it gets an opaque id, and every read
   goes through the check in `openUploadFor`.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The ceiling in effect, read per request from the admin setting.
 *
 * A function rather than a constant, so a change in the mask applies to the next upload
 * without a restart. It also bounds a single request body, which is why the setting
 * offers a fixed list of sizes rather than a free number.
 */
export const uploadLimitBytes = (): number => maxUploadBytes();

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
  /** File name on disk, or the full object key in the bucket. */
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  scope: UploadScope;
  /**
   * Which backend holds the bytes. Defaults to `disk` for every row written
   * before the column existed, which is where those bytes actually are.
   */
  storage: StorageBackend;
  /** Hex SHA-256. Empty for rows written before it was recorded. */
  checksum: string;
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
  const limit = uploadLimitBytes();
  if (file.size > limit) {
    throw new UploadError(
      `„${displayName(file.name)}“ ist größer als ${Math.floor(limit / 1024 / 1024)} MB.`,
    );
  }

  const extension = safeExtension(file.name);
  const id = randomUUID();
  // Generated, never derived from the upload — a UUID plus a checked extension
  // cannot contain a path separator, so it cannot escape a directory or a prefix.
  const objectName = `${id}${extension}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the extension, not the browser-supplied Content-Type: the type is only
  // ever used for a download response, never to execute anything.
  const mimeType = ALLOWED_EXTENSIONS[extension];

  const backend = activeBackend(isFeatureEnabled("feature_s3_storage"));
  const written = await writeObject(backend, objectName, bytes, mimeType);

  const row: UploadRow = {
    id,
    owner_id: user.id,
    ticket_id: null,
    original_name: displayName(file.name),
    stored_name: written.objectKey,
    mime_type: mimeType,
    size_bytes: written.size,
    created_at: new Date().toISOString(),
    scope,
    storage: written.backend,
    checksum: written.checksum,
  };

  try {
    db.prepare(
      `INSERT INTO mits_upload
         (id, owner_id, ticket_id, original_name, stored_name, mime_type,
          size_bytes, created_at, scope, storage, checksum)
       VALUES
         (@id, @owner_id, @ticket_id, @original_name, @stored_name, @mime_type,
          @size_bytes, @created_at, @scope, @storage, @checksum)`,
    ).run(row);
  } catch (error) {
    // Do not leave a blob behind that nothing points at. Awaited rather than
    // fired and forgotten: on a serverless host the process can be frozen the
    // moment this function returns, and the orphan would survive forever.
    await removeObject(written.backend, written.objectKey);
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

/**
 * Everything attached to one ticket, oldest first.
 *
 * For the resources panel. **No access check here** — the caller has already
 * resolved the ticket through `getTicketFor`, and every one of these ids is
 * checked again by the download route on the request that actually reads a file.
 * A list is not a grant, which is why this can be the cheap query.
 */
export function listUploadsForTicket(ticketId: string): {
  id: string;
  name: string;
  bytes: number;
  createdAt: Date;
}[] {
  const rows = db
    .prepare(
      `SELECT id, original_name, size_bytes, created_at
         FROM mits_upload
        WHERE deleted_at IS NULL AND ticket_id = ?
        ORDER BY created_at ASC`,
    )
    .all(ticketId) as {
    id: string;
    original_name: string;
    size_bytes: number;
    created_at: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.original_name,
    bytes: row.size_bytes,
    createdAt: new Date(row.created_at),
  }));
}

export interface ReadableUpload {
  name: string;
  type: string;
  size: number;
  /** Safe to render in an <img>. Everything else is download-only. */
  inlineImage: boolean;
  stream: () => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
}

/**
 * Open an upload for download, or return null when it does not exist **or** the
 * user may not read it. Same answer for both, so ids cannot be probed.
 *
 * A ticket attachment is readable by its owner and by agents and admins — they
 * work the tickets these files belong to. A FAQ attachment is readable by anyone
 * signed in, which is the whole point of publishing it.
 *
 * `canSeeTicket` is passed in rather than imported: `lib/tickets.ts` already imports
 * this module for `linkUploadsToTicket`, so calling `getTicketFor` from here would
 * close a cycle. It happens to work today because both references sit inside function
 * bodies, but a cycle is a trap that springs the first time either module needs the
 * other at evaluation time. Inverting it keeps the visibility rule in one place —
 * `getTicketFor` — while leaving this module a leaf.
 *
 * Omitting the callback denies participant access rather than granting it, so a
 * caller that forgets it fails closed.
 *
 * Async since the S3 backend arrived: opening an object there is a network round
 * trip. The access decision is still made synchronously and *before* it — no
 * request leaves this process for a file the caller may not read, which also means
 * the S3 access log cannot be used to probe which upload ids exist.
 */
export async function openUploadFor(
  id: string,
  user: SessionUser,
  canSeeTicket?: (ticketId: string) => boolean,
): Promise<ReadableUpload | null> {
  // A soft-deleted upload is not readable, so a removed attachment stops being
  // served even though the blob is still on disk for a later restore.
  const row = db
    .prepare("SELECT * FROM mits_upload WHERE deleted_at IS NULL AND id = ?")
    .get(id) as UploadRow | undefined;
  if (!row) return null;

  /*
   * Four ways this may be readable, in the order they are cheapest to decide.
   *
   * The last one is what makes an embedded screenshot work: an agent pastes an image
   * into a reply, the upload belongs to the *agent*, and the reporter is neither its
   * owner nor staff — so without this the image in their own ticket would 404. If you
   * may open the ticket, you may see what is attached to it; `getTicketFor` answers
   * that question with the same rules the ticket page uses.
   */
  const readable =
    row.scope === "faq" ||
    row.owner_id === user.id ||
    canViewBoard(user.role) ||
    (row.ticket_id !== null && (canSeeTicket?.(row.ticket_id) ?? false));
  if (!readable) return null;

  /*
   * Read from the backend the *row* names, not the one currently configured.
   *
   * This is the line that makes switching to S3 safe: every attachment written
   * before the switch stays on disk and keeps being served from there. Reading
   * `activeBackend()` here instead would 404 the entire existing archive the
   * moment somebody saved the settings page, and the page would report success.
   *
   * Defaulted to `disk` because that is where a row predating the column actually
   * has its bytes.
   */
  const object = await readObject(row.storage ?? "disk", row.stored_name);
  if (!object) return null;

  return {
    name: row.original_name,
    type: row.mime_type,
    size: row.size_bytes,
    inlineImage: isInlineImage(row.mime_type),
    // Streaming rather than reading into memory keeps a 25 MB download off the
    // heap, on both backends.
    stream: object.stream,
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
    "SELECT scope FROM mits_upload WHERE deleted_at IS NULL AND id = ?",
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
    "SELECT id, owner_id, ticket_id FROM mits_upload WHERE deleted_at IS NULL AND id = ?",
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
