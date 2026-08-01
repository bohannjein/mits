import "server-only";

import { Readable } from "node:stream";

import {
  EMPTY_BODY_SHA256,
  sha256Hex,
  signS3Request,
} from "@/lib/services/s3-sign";
import { isS3Configured, type S3Settings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   A three-verb S3 client: PUT, GET, DELETE.

   Signing lives in `s3-sign.ts` and is pure; this file is the part that talks to
   the network. Splitting them is what makes the signature testable offline — the
   only feedback a wrong signature produces is a 403 from a remote host.

   **Fail closed.** Every call re-checks `isS3Configured`. A half-filled settings
   mask must not produce a request that is silently unsigned or aimed at an empty
   bucket name; it produces an error naming the missing configuration.
   ────────────────────────────────────────────────────────────────────────── */

export class S3Error extends Error {}

/** Ten seconds. An attachment upload that hangs must not hold a request open. */
const TIMEOUT_MS = 15_000;

interface Target {
  host: string;
  path: string;
  protocol: "http" | "https";
}

/**
 * Where one object lives, in whichever addressing style is configured.
 *
 * Path style puts the bucket in the path, virtual-host style in the hostname. The
 * distinction matters to the *signature*, not just to the URL: the bucket is part
 * of the canonical URI in one and part of the signed `host` header in the other.
 */
function target(settings: S3Settings, key: string): Target {
  const protocol = settings.secure ? "https" : "http";
  const endpoint = settings.endpoint.trim();
  const bucket = settings.bucket.trim();

  if (settings.forcePathStyle) {
    return { host: endpoint, path: `/${bucket}/${key}`, protocol };
  }
  return { host: `${bucket}.${endpoint}`, path: `/${key}`, protocol };
}

function requireConfigured(settings: S3Settings): void {
  if (!isS3Configured(settings)) {
    throw new S3Error(
      "S3 ist nicht vollständig konfiguriert (Endpunkt, Bucket, Access Key und Secret).",
    );
  }
}

const credentialsOf = (settings: S3Settings) => ({
  accessKeyId: settings.accessKeyId.trim(),
  secretAccessKey: settings.secretAccessKey,
  region: settings.region.trim() || "us-east-1",
});

/**
 * Read an error body without letting it become the error.
 *
 * S3 answers with an XML document; the useful part is the `<Code>` element, and
 * the rest is a request id and a signature dump that would fill a toast. Truncated
 * hard, because an endpoint that is not actually S3 can answer with an HTML page.
 */
async function describeFailure(response: Response): Promise<string> {
  let detail = "";
  try {
    const text = await response.text();
    detail = text.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? text.slice(0, 200);
  } catch {
    /* the status alone will have to do */
  }
  return detail ? `HTTP ${response.status} — ${detail}` : `HTTP ${response.status}`;
}

export async function putObject(
  settings: S3Settings,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  requireConfigured(settings);
  const { host, path, protocol } = target(settings, key);

  const signed = signS3Request(
    {
      method: "PUT",
      host,
      path,
      headers: {
        "content-type": contentType,
        "content-length": String(body.byteLength),
      },
      payloadHash: sha256Hex(body),
    },
    credentialsOf(settings),
    new Date(),
    protocol,
  );

  const response = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new S3Error(`Upload nach S3 fehlgeschlagen: ${await describeFailure(response)}`);
  }
}

export interface S3Object {
  stream: ReadableStream<Uint8Array>;
  contentLength: number | null;
}

/**
 * Fetch an object as a stream.
 *
 * Streamed rather than buffered for the same reason the disk backend uses
 * `createReadStream`: a 25 MB attachment must not sit on the heap while it is
 * being written to the response.
 *
 * No timeout on this one. `AbortSignal.timeout` aborts the whole response
 * including the body, so a fifteen-second limit would truncate any download slower
 * than that — turning a slow connection into a corrupt file with no error.
 */
export async function getObject(
  settings: S3Settings,
  key: string,
): Promise<S3Object | null> {
  requireConfigured(settings);
  const { host, path, protocol } = target(settings, key);

  const signed = signS3Request(
    { method: "GET", host, path, payloadHash: EMPTY_BODY_SHA256 },
    credentialsOf(settings),
    new Date(),
    protocol,
  );

  const response = await fetch(signed.url, {
    method: "GET",
    headers: signed.headers,
  });

  // A missing object is not an error here: the caller answers 404, exactly as the
  // disk backend does for a file that is not on disk.
  if (response.status === 404) return null;
  if (!response.ok || !response.body) {
    throw new S3Error(`Download aus S3 fehlgeschlagen: ${await describeFailure(response)}`);
  }

  const length = response.headers.get("content-length");
  return {
    stream: response.body,
    contentLength: length === null ? null : Number(length),
  };
}

export async function deleteObject(
  settings: S3Settings,
  key: string,
): Promise<void> {
  requireConfigured(settings);
  const { host, path, protocol } = target(settings, key);

  const signed = signS3Request(
    { method: "DELETE", host, path, payloadHash: EMPTY_BODY_SHA256 },
    credentialsOf(settings),
    new Date(),
    protocol,
  );

  const response = await fetch(signed.url, {
    method: "DELETE",
    headers: signed.headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // S3 answers 204 for a delete of something that was not there. Treated as
  // success, because the postcondition — the object does not exist — holds.
  if (!response.ok && response.status !== 404) {
    throw new S3Error(`Löschen in S3 fehlgeschlagen: ${await describeFailure(response)}`);
  }
}

/**
 * Round-trip check for the settings mask.
 *
 * Writes a small object, reads it back, compares, deletes it. Not a `HEAD` on the
 * bucket: that proves the credentials can *list*, and the failure this test exists
 * to catch is a policy that allows listing and refuses `PutObject`. A test that
 * passes against a bucket nobody can write to is worse than no test.
 */
export async function verifyS3(settings: S3Settings): Promise<string> {
  const key = `${settings.prefix}.mits-connection-test`;
  const payload = Buffer.from(`MITS ${new Date().toISOString()}`, "utf8");

  await putObject(settings, key, payload, "text/plain");

  try {
    const object = await getObject(settings, key);
    if (!object) throw new S3Error("Objekt wurde geschrieben, ist aber nicht lesbar.");

    const readBack = Buffer.from(
      await new Response(object.stream).arrayBuffer(),
    );
    if (!readBack.equals(payload)) {
      throw new S3Error("Gelesene Daten weichen von den geschriebenen ab.");
    }
  } finally {
    // Always, including after a failed read: a test that leaves litter in the
    // bucket every time somebody presses the button is its own small problem.
    await deleteObject(settings, key).catch(() => {});
  }

  return `Schreiben, Lesen und Löschen in „${settings.bucket}“ erfolgreich.`;
}

/** Node stream → web stream, for the disk backend to match this module's shape. */
export const toWebStream = (readable: Readable): ReadableStream<Uint8Array> =>
  Readable.toWeb(readable) as ReadableStream<Uint8Array>;
