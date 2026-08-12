import "server-only";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";

import { recordAuthEvent } from "@/lib/auth-log";
import { provisionedRole } from "@/lib/auth/bootstrap";
import { DEFAULT_ROLE } from "@/lib/auth/roles";
import { authSecret } from "@/lib/auth/secret";
import { db } from "@/lib/db/sqlite";
import { getAuthSettings, isEmailDomainAllowed } from "@/lib/settings";
import {
  DEFAULT_SESSION_LIFETIME_DAYS,
  sessionLifetimeSeconds,
} from "@/types/mits";

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

/* ──────────────────────────────────────────────────────────────────────────
   Sitzungsdauer: eine Einstellung, kein Neustart.

   `session.expiresIn` ist in Better Auth ein statischer Wert. Er wird **einmal**
   gelesen, wenn `betterAuth(options)` den Kontext aufbaut, und daraus entstehen
   zwei Dinge: das `expiresAt` der Sitzungszeile und das `Max-Age` des Cookies.
   Eine Zahl, die aus `mits_setting` kommt, wäre damit bis zum nächsten
   Serverstart wirkungslos — ein Admin stellt „7 Tage" ein, nichts passiert, und
   das Naheliegende ist, die Einstellung für kaputt zu halten.

   Deshalb ist die Instanz an den *Wert* gebunden und nicht an den Prozess:
   `getAuth()` liest die Einstellung und baut neu, wenn sie sich geändert hat.
   Kostet einen indizierten Read pro Aufruf und einen Neuaufbau pro Änderung.

   Der naheliegende Weg — `expiresIn` groß lassen und `expiresAt` in
   `databaseHooks.session.create.before` kürzen — ist ausprobiert und falsch:
   Better Auth entscheidet über die Verlängerung mit
   `expiresAt - expiresIn + updateAge <= now`. Stimmen die beiden nicht zusammen,
   ist diese Bedingung *immer* wahr, und jede Anfrage schreibt die Sitzungszeile
   neu. Auf einem Desk, dessen Queue im Sekundentakt nachfragt, ist das ein
   Schreibvorgang pro Poll.
   ────────────────────────────────────────────────────────────────────────── */

/** Die Obergrenze, die dieser Instanz gerade eingestellt ist. */
function configuredSessionSeconds(): number {
  return sessionLifetimeSeconds(getAuthSettings().sessionLifetimeDays);
}

/**
 * Alles außer der Sitzungsdauer.
 *
 * Getrennt, damit `authOptionsFor` nur den einen Schlüssel ergänzt und nicht die
 * ganze Konfiguration zweimal existiert. Die Reihenfolge der Objekt-Schlüssel ist
 * dabei bedeutungslos — „muss zuletzt stehen" gilt für `nextCookies()` innerhalb
 * des `plugins`-Arrays, nicht für die Position des Arrays.
 */
const baseAuthOptions = {
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

  databaseHooks: {
    session: {
      create: {
        /**
         * Jede vergebene Sitzung ist eine Anmeldung.
         *
         * An der Sitzung und nicht am Endpunkt, damit auch ein künftiger zweiter
         * Weg hinein — ein sozialer Anbieter, ein Magic Link — mit erfasst ist,
         * ohne dass jemand daran denken muss.
         *
         * Der Zweifaktor-Fall zählt hier genau einmal, obwohl er zwei Sitzungen
         * anfasst: `verify-totp` legt die Sitzung erst nach dem Code an. Was beim
         * *Einrichten* passiert, ist der Ausreißer — dort wird eine bestehende
         * Sitzung getauscht, das erzeugt also eine zweite Zeile. Eine Anmeldung
         * zu viel im Protokoll ist die harmlose Richtung.
         *
         * `recordAuthEvent` wirft nie; ein Fehlschlag beim Protokollieren darf
         * keine Anmeldung scheitern lassen.
         */
        after: async (session) => {
          const row = db
            .prepare("SELECT email FROM user WHERE id = ?")
            .get(session.userId) as { email?: string } | undefined;

          recordAuthEvent(
            "sign_in",
            { id: session.userId, email: row?.email ?? "" },
            session.ipAddress ?? "",
          );
        },
      },
    },
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

          /*
           * Ein Konto, das der Server selbst anlegt: der Seeder, der eine
           * Instanz mit Benutzern aber ohne Administrator aufholt, und die
           * Kontoanlage unter `/admin/staff`.
           *
           * Beides umgeht Registrierungsschalter *und* Domain-Whitelist, und
           * beides mit Absicht: die Policy regelt, wer sich selbst anmelden
           * darf, nicht wen ein Administrator einträgt — ein externer Dienst-
           * leister mit fremder Adresse ist genau der Fall, für den die Maske
           * existiert. Was das trägt, ist `requireRole("admin")` an der
           * Aufrufstelle; hier steht nur das Fenster, und es ist auf die eine
           * Adresse eingegrenzt, damit eine gleichzeitige Registrierung nicht
           * mit durchrutscht.
           */
          const provisioned = provisionedRole(user.email);
          if (provisioned) {
            return { data: { ...user, role: provisioned } };
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

  plugins: [
    /*
     * Zweiter Faktor: TOTP plus Ersatzcodes.
     *
     * Nur TOTP und keine OTP-per-Mail: der Faktor soll auch dann tragen, wenn
     * SMTP nicht eingerichtet ist — sonst hinge die Anmeldung an demselben
     * Mailserver, dessen Fehlen schon die Verifikation der Adresse verhindert.
     *
     * `skipVerificationOnEnable` bleibt aus (Default). Damit steht
     * `twoFactorEnabled` erst auf `true`, wenn ein Code aus der App einmal
     * durchgelaufen ist — wer die App falsch einrichtet, sperrt sich nicht selbst
     * aus, weil das Konto bis dahin ohne zweiten Faktor anmeldbar bleibt.
     *
     * `issuer` ist der Name, den die Authenticator-App anzeigt. Ohne ihn stünde
     * dort "Better Auth", und auf einem Telefon mit einem Dutzend Einträgen ist
     * der Name das Einzige, woran der Eintrag wiederzuerkennen ist.
     */
    twoFactor({ issuer: "MITS" }),
    // Must stay last: it forwards Set-Cookie through Next's cookie API.
    nextCookies(),
  ],
} satisfies BetterAuthOptions;

export function authOptionsFor(sessionSeconds: number) {
  return {
    ...baseAuthOptions,
    session: {
      expiresIn: sessionSeconds,
      /*
       * Wie oft eine lebende Sitzung verlängert wird. **Nicht** an `expiresIn`
       * gekoppelt: bei „1 Tag" wäre eine tägliche Verlängerung dieselbe Zahl wie
       * der Ablauf, und die Sitzung würde bei jeder Anfrage neu geschrieben.
       * Einmal am Tag ist der Kompromiss zwischen „läuft mitten in der Arbeit ab"
       * und „ein Schreibvorgang pro Poll".
       */
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        // Short on purpose: the proxy reads the role from this signed cookie, so
        // a demotion must not stay effective for long. Authoritative checks in
        // the route guards hit the database regardless.
        maxAge: 60,
      },
    },
  } satisfies BetterAuthOptions;
}

/**
 * Die Instanz für die aktuell eingestellte Sitzungsdauer.
 *
 * Gemerkt am Wert und nicht am Prozess: derselbe Wert gibt dieselbe Instanz
 * zurück, ein geänderter baut neu. Eine Funktion und keine Konstante, weil eine
 * Konstante genau das nicht kann — und weil die fünf Aufrufstellen dadurch
 * sichtbar machen, dass hier etwas nachgelesen wird.
 */
function buildAuth(sessionSeconds: number) {
  return betterAuth(authOptionsFor(sessionSeconds));
}

/*
 * Inferred from `buildAuth`, not written as `Auth<BetterAuthOptions>`.
 *
 * The generic parameter is what carries `additionalFields` — annotating the cache
 * with the wide type erases `role` and `mustChangePassword` from
 * `api.getSession`, and every guard that reads them then fails to compile for a
 * reason that looks like it is about sessions.
 */
type MITSAuth = ReturnType<typeof buildAuth>;

let cachedAuth: { seconds: number; instance: MITSAuth } | null = null;

export function getAuth(): MITSAuth {
  const seconds = configuredSessionSeconds();

  const current = cachedAuth;
  if (current && current.seconds === seconds) return current.instance;

  const instance = buildAuth(seconds);
  cachedAuth = { seconds, instance };
  return instance;
}

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
    // The default lifetime, because the schema does not depend on it: `expiresIn`
    // decides what goes *into* `expires_at`, not that the column exists.
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(
      authOptionsFor(sessionLifetimeSeconds(DEFAULT_SESSION_LIFETIME_DAYS)),
    );
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
