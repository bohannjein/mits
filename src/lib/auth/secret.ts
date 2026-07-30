import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* ──────────────────────────────────────────────────────────────────────────
   Data directory and session secret.

   Deliberately free of database imports: `src/proxy.ts` needs the secret to
   verify the signed session cookie, and must not pull the SQLite driver into its
   bundle.
   ────────────────────────────────────────────────────────────────────────── */

/** Runtime state lives outside the repo; `data/` is gitignored. */
export function dataDir(): string {
  const dir = process.env.MITS_DATA_DIR?.trim() || join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Read a generated secret from the data dir, creating it once if absent.
 *
 * Generating beats shipping a constant: a hardcoded default in the repository
 * would let anyone who read it forge sessions on every instance that never
 * overrode it.
 */
function persistedSecret(
  fileName: string,
  mode: number,
  minLength = 32,
): string {
  const file = join(dataDir(), fileName);

  if (existsSync(file)) {
    const stored = readFileSync(file, "utf8").trim();
    if (stored.length >= minLength) return stored;
  }

  const generated = randomBytes(32).toString("hex");
  writeFileSync(file, `${generated}\n`, { encoding: "utf8", mode });
  try {
    chmodSync(file, mode);
  } catch {
    // Windows ignores POSIX modes; the file still lands in the private data dir.
  }
  return generated;
}

let cached: string | null = null;

/**
 * HMAC key that signs session cookies.
 *
 * `BETTER_AUTH_SECRET` wins. Without it, a random key is generated once and
 * persisted in the data dir so a self-hosted instance survives a restart without
 * logging everyone out. Generating rather than shipping a constant matters: a
 * hardcoded fallback would let anyone forge a session on a default install.
 */
export function authSecret(): string {
  if (cached) return cached;

  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  cached = fromEnv || persistedSecret("auth-secret", 0o600);
  return cached;
}

let cachedServiceToken: string | null = null;

/**
 * Shared secret between the web app and the AI backend.
 *
 * Generated here and dropped into the data dir, which the backend mounts
 * read-only — that is what makes a one-click deployment with no environment
 * variables possible while every instance still gets its own random token.
 *
 * Mode 0644, not 0600: the backend container runs as a different user and has to
 * read it. That is not a downgrade in practice — anyone who can read this volume
 * can already read mits.db with the sessions in it — and the backend publishes no
 * port, so the token is defence in depth rather than the only lock.
 */
export function serviceToken(): string {
  if (cachedServiceToken) return cachedServiceToken;

  const fromEnv = process.env.MITS_SERVICE_TOKEN?.trim();
  cachedServiceToken = fromEnv || persistedSecret("service-token", 0o644);
  return cachedServiceToken;
}
