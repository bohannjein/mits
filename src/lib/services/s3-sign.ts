import { createHash, createHmac } from "node:crypto";

/* ──────────────────────────────────────────────────────────────────────────
   AWS Signature Version 4, the part of it S3 needs.

   **Why not `@aws-sdk/client-s3`.** It is roughly twenty megabytes of transitive
   dependencies to issue three request shapes — PUT, GET, DELETE — against a
   protocol that has not changed in a decade. The same argument the backend's
   four-package rule makes: a dependency has to earn the image size and the supply
   chain it drags in, and this one would be carrying a credential provider chain, a
   retry middleware stack and an XML parser for a self-hosted helpdesk that stores
   screenshots.

   **This file is pure.** No network, no settings, no clock of its own — the
   timestamp is a parameter. That is deliberate: a signing bug produces a
   `SignatureDoesNotMatch` from a remote server with no indication of *which* of
   six steps was wrong, so the steps are exercised against the AWS documentation's
   own published test vectors in `npm test`.

   Reference: "Signature Version 4 signing process", the S3 (single-chunk,
   unsigned-trailer) variant.
   ────────────────────────────────────────────────────────────────────────── */

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SigV4Request {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  /** Host header, without scheme — part of the signature. */
  host: string;
  /** Absolute path, already including the bucket for path-style. Not encoded. */
  path: string;
  /** Query parameters. Sorted and encoded here. */
  query?: Record<string, string>;
  /** Headers to sign, besides the three this function always adds. */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the body. `EMPTY_BODY_SHA256` for a request with none. */
  payloadHash: string;
}

/** SHA-256 of the empty string — what a GET or DELETE signs as its payload. */
export const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: Buffer | string): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/**
 * Percent-encode one path segment the way SigV4 wants it.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS does not, so those are
 * finished by hand. Getting this wrong is invisible until somebody uploads a file
 * whose generated key happens to contain one — which, since keys are UUIDs plus an
 * extension, would be never in testing and eventually in production.
 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The canonical URI: every segment encoded, the slashes kept.
 *
 * S3 signs the path **singly** encoded, unlike most other AWS services. Passing an
 * already-encoded path in would therefore double-encode it and fail the signature.
 */
export function canonicalUri(path: string): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return normalised.split("/").map(encodeSegment).join("/");
}

/** `a=1&b=2`, sorted by key then value, both percent-encoded. */
export function canonicalQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([key, value]) => [encodeSegment(key), encodeSegment(value)] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** `20260801T120000Z` and `20260801`, the two forms the signature needs. */
export function amzDates(at: Date): { amzDate: string; dateStamp: string } {
  const amzDate = at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Sign a request and return the headers to send with it.
 *
 * The three headers this always adds — `host`, `x-amz-date`,
 * `x-amz-content-sha256` — are also the three that are always signed. S3 requires
 * the content hash header even when the body is empty.
 */
export function signS3Request(
  request: SigV4Request,
  credentials: SigV4Credentials,
  at: Date,
  /** `http` for a plain MinIO on a LAN, `https` everywhere else. */
  protocol: "http" | "https",
): SignedRequest {
  const { amzDate, dateStamp } = amzDates(at);

  const headers: Record<string, string> = {
    ...(request.headers ?? {}),
    host: request.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": request.payloadHash,
  };

  /*
   * Canonical headers: lowercase names, trimmed values, sorted, one per line.
   *
   * Whitespace inside a value is collapsed because the spec says so — a
   * `Content-Type: text/plain;  charset=utf-8` with two spaces signs differently
   * from what the server receives after its own normalisation.
   */
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalHeaders = entries.map(([n, v]) => `${n}:${v}\n`).join("");
  const signedHeaders = entries.map(([n]) => n).join(";");

  const canonicalRequest = [
    request.method,
    canonicalUri(request.path),
    canonicalQuery(request.query ?? {}),
    canonicalHeaders,
    signedHeaders,
    request.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${credentials.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, dateStamp), credentials.region), SERVICE),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  const query = canonicalQuery(request.query ?? {});

  return {
    url: `${protocol}://${request.host}${canonicalUri(request.path)}${query ? `?${query}` : ""}`,
    headers: {
      ...headers,
      Authorization:
        `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Exposed for the offline suite, which checks the intermediate steps. */
export const __sigv4Internals = { encodeSegment, hmac };
