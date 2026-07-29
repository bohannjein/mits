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
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  const file = join(dataDir(), "auth-secret");
  if (existsSync(file)) {
    const stored = readFileSync(file, "utf8").trim();
    if (stored.length >= 32) {
      cached = stored;
      return cached;
    }
  }

  const generated = randomBytes(32).toString("hex");
  writeFileSync(file, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows ignores POSIX modes; the file still lands in the private data dir.
  }
  cached = generated;
  return cached;
}
