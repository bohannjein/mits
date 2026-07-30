import "server-only";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { isSeedingAdmin } from "@/lib/auth/bootstrap";
import { DEFAULT_ROLE } from "@/lib/auth/roles";
import { authSecret } from "@/lib/auth/secret";
import { db } from "@/lib/db/sqlite";
import { getAuthSettings, isEmailDomainAllowed } from "@/lib/settings";

/* ──────────────────────────────────────────────────────────────────────────
   Better Auth server instance.

   Email and password only — no SMTP is configured in this phase, so email
   verification stays off rather than pretending to send mail nobody receives.
   ────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   Trusted origins for a self-hosted instance.

   Better Auth trusts its `baseURL` plus `localhost`, and rejects everything
   else with INVALID_ORIGIN. For MITS that default is wrong: the hostname is
   whoever deploys it — `mits.firma.de`, a bare LAN IP, `dubuntulocal:3000` —
   and none of that is knowable at build time. Requiring BETTER_AUTH_URL would
   make the zero-config deployment promised in docker-compose.yml impossible to
   keep, because a fresh stack simply could not log in.

   So the origin is derived per request from the host the client asked for.

   ── Why this is not a hole in the CSRF protection ──

   The attack this guards against is evil.com making a victim's browser POST
   here with the victim's cookies. In that request the browser sets
   `Origin: https://evil.com` while `Host` stays this instance — so the two do
   not match and the request is still rejected. What is emphatically NOT done
   here is echoing the request's own `Origin` header back as trusted; that
   would trust evil.com by definition and disable the check entirely.

   A caller can of course forge `Host`/`X-Forwarded-Host` on a request it makes
   itself, but that buys nothing: to pass the check it must also set a matching
   `Origin`, and a page cannot set either header on a cross-site form post. A
   `fetch` that tries needs CORS preflight approval, which never comes.

   Host-header injection is the other usual worry, and it does not apply: MITS
   sends no mail, so there is no reset link built from the host that a poisoned
   value could redirect.
   ────────────────────────────────────────────────────────────────────────── */

/** Explicitly configured origins. These win and are always trusted. */
function configuredOrigins(): string[] {
  const origins = (process.env.MITS_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const baseUrl = process.env.BETTER_AUTH_URL?.trim();
  if (baseUrl) origins.push(baseUrl);

  return origins;
}

/** The origin this very request came in on, from `Host`. */
function requestOrigins(request?: Request): string[] {
  if (!request) return [];

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return [];

  // Both schemes on purpose: behind a TLS-terminating proxy that does not set
  // x-forwarded-proto there is no way to tell which one the browser used, and
  // the host is the part that carries the security meaning anyway.
  return [`http://${host}`, `https://${host}`];
}

/** True while the instance has no users at all — the bootstrap window. */
function isFirstUser(): boolean {
  const row = db.prepare("SELECT COUNT(*) AS count FROM user").get() as
    | { count: number }
    | undefined;
  return (row?.count ?? 0) === 0;
}

export const authOptions = {
  appName: "MITS",
  secret: authSecret(),
  database: db,
  // Only set when known: Better Auth otherwise derives the origin from the
  // request, which is what a self-hosted instance behind a proxy needs.
  baseURL: process.env.BETTER_AUTH_URL?.trim() || undefined,
  trustedOrigins: (request) => [
    ...configuredOrigins(),
    ...requestOrigins(request),
  ],

  emailAndPassword: {
    enabled: true,
    // No mail transport in this phase; turning verification on would lock
    // everyone out of an instance that cannot send the mail.
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 256,
    autoSignIn: true,
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: DEFAULT_ROLE,
        // The security-critical flag. Without `input: false`, a self-registering
        // client could POST `role: "admin"` to /sign-up/email and escalate.
        input: false,
      },
      /**
       * Set on the seeded administrator, whose password is a documented
       * default. While it is true the session may do nothing but change that
       * password — see `requireUser`. `input: false` for the same reason as
       * `role`: a client must not be able to clear its own gate.
       */
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
        fieldName: "must_change_password",
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      // Short on purpose: the proxy reads the role from this signed cookie, so
      // a demotion must not stay effective for long. Authoritative checks in
      // the route guards hit the database regardless.
      maxAge: 60,
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Registration policy gate. Runs for every user-creation path, so it also
         * covers a future social provider — not just /sign-up/email.
         */
        before: async (user) => {
          // The very first account always gets through and becomes admin.
          // Otherwise a fresh instance with registration disabled by default
          // would have no way to ever create an administrator.
          if (isFirstUser()) {
            return { data: { ...user, role: "admin" } };
          }

          // The seeder recovers an instance that has users but no administrator
          // — a database restored from a partial backup, say. Scoped to the one
          // address the seeder is creating, so a sign-up racing this cannot slip
          // through as admin.
          if (isSeedingAdmin(user.email)) {
            return { data: { ...user, role: "admin" } };
          }

          const settings = getAuthSettings();

          if (!settings.registrationEnabled) {
            throw new APIError("FORBIDDEN", {
              message: "Die Selbstregistrierung ist derzeit deaktiviert.",
            });
          }

          if (!isEmailDomainAllowed(user.email, settings.allowedEmailDomains)) {
            throw new APIError("FORBIDDEN", {
              message: `Registrierung nur mit einer E-Mail-Adresse dieser Domains möglich: ${settings.allowedEmailDomains.join(", ")}.`,
            });
          }

          // Force the default role even though `input: false` already strips a
          // client-supplied value — defence in depth for other creation paths.
          return { data: { ...user, role: DEFAULT_ROLE } };
        },
      },
    },
  },

  // Must stay last: it forwards Set-Cookie through Next's cookie API.
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

/* ──────────────────────────────────────────────────────────────────────────
   Schema bootstrap.

   Better Auth ships a CLI migrator; running it programmatically keeps
   "clone, npm install, npm run dev" working without a separate migration step.
   Memoised, so concurrent requests share one run.
   ────────────────────────────────────────────────────────────────────────── */

let schemaReady: Promise<void> | null = null;

export function ensureAuthSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const { getMigrations } = await import("better-auth/db/migration");
    const { toBeCreated, toBeAdded, runMigrations } =
      await getMigrations(authOptions);
    if (toBeCreated.length > 0 || toBeAdded.length > 0) {
      await runMigrations();
    }
  })().catch((error) => {
    // Never cache a failure: the next request should retry rather than serve a
    // permanently broken instance.
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}
