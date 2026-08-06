import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

import {
  deniedPathFor,
  hasAtLeast,
  homeFor,
  toRole,
  type MITSRole,
} from "@/lib/auth/roles";
import { auth, ensureAuthSchema } from "@/lib/auth/server";
import { canSeeArea } from "@/lib/role-visibility";
import { mustChangePassword } from "@/lib/users";
import type { NavArea } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Authoritative session access.

   The Next.js docs are explicit that the proxy is not a security boundary — a
   refactor that moves a Server Function or changes a matcher silently removes
   proxy coverage. Every protected page and every route handler therefore calls
   one of these helpers, which hit the database rather than trusting a cookie.
   ────────────────────────────────────────────────────────────────────────── */

/** Where a gated session is allowed to go, and nowhere else. */
export const PASSWORD_CHANGE_PATH = "/settings/profile";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: MITSRole;
  emailVerified: boolean;
  /**
   * Set on the seeded administrator until it replaces the documented default
   * password. A session carrying this may only change that password.
   */
  mustChangePassword: boolean;
}

function toSessionUser(user: {
  id: string;
  name?: string | null;
  email: string;
  emailVerified?: boolean | null;
  role?: unknown;
}): SessionUser {
  return {
    id: user.id,
    name: user.name?.trim() || user.email,
    email: user.email,
    // Unknown values degrade to "user" — never to a higher privilege.
    role: toRole(user.role),
    emailVerified: user.emailVerified === true,
    // Deliberately not read from `user.mustChangePassword`: that value comes out
    // of the 60-second session-cache cookie. See `mustChangePassword`.
    mustChangePassword: mustChangePassword(user.id),
  };
}

/** Current user from the request headers, or null. Never throws on a bad cookie. */
/**
 * The signed-in user, resolved **once per request**.
 *
 * `cache()` is React's per-request memo, and it is load-bearing rather than an
 * optimisation. Every guarded page calls this, and since the realtime provider
 * moved into the root layout, so does the layout wrapping it — so a single page
 * view was doing the session lookup twice: two Better Auth calls, two reads of
 * `mits_user`, two `mustChangePassword` queries.
 *
 * better-sqlite3 is synchronous, which means each of those blocks the event loop
 * for everybody. Doubling the per-request cost of the one function every page
 * calls is the kind of thing that is invisible with three users and decides
 * whether a hundred of them get an answer.
 *
 * Safe to memoise: it derives from the request's own headers, so two calls in one
 * request can only ever produce the same answer.
 */
export const getSessionUser = cache(
  async (): Promise<SessionUser | null> => {
    await ensureAuthSchema();
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user ? toSessionUser(session.user) : null;
  },
);

/** Same, but for route handlers that already hold the Request. */
export async function getSessionUserFor(
  request: Request,
): Promise<SessionUser | null> {
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ? toSessionUser(session.user) : null;
}

/**
 * Page guard: redirects to the login form, preserving where the user wanted to go.
 *
 * Also enforces the password-change gate. That is on purpose in the *shared*
 * guard rather than in each page: an account with a published default password
 * must not be able to reach anything by virtue of a page author forgetting the
 * check. The one page that may skip it calls `requireUserForPasswordChange`,
 * which is named so the exception is visible at the call site.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/login${target}`);
  }
  if (user.mustChangePassword) {
    redirect(PASSWORD_CHANGE_PATH);
  }
  return user;
}

/**
 * The gated variant, for `/settings/profile` only. Returns the user even when
 * `mustChangePassword` is set — otherwise the redirect above would loop.
 */
export async function requireUserForPasswordChange(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(PASSWORD_CHANGE_PATH)}`);
  return user;
}

/**
 * Route-handler guard. Route handlers cannot redirect a fetch usefully, so the
 * gate answers with a status the client can act on. Every handler that changes
 * or reads data calls this rather than `getSessionUserFor` directly.
 */
export async function requireApiUser(
  request: Request,
): Promise<{ user: SessionUser } | { response: Response }> {
  const user = await getSessionUserFor(request);

  if (!user) {
    return {
      response: Response.json({ error: "Nicht angemeldet." }, { status: 401 }),
    };
  }

  if (user.mustChangePassword) {
    return {
      response: Response.json(
        {
          error:
            "Das Passwort dieses Kontos muss zuerst geändert werden.",
          redirect: PASSWORD_CHANGE_PATH,
        },
        { status: 403 },
      ),
    };
  }

  return { user };
}

/**
 * Route-handler guard with a role floor.
 *
 * `requireApiUser` plus `hasAtLeast`, so a handler that only staff or only admins
 * may reach states that in one line instead of re-deriving it. The answer for an
 * authenticated caller without the role is 403, not 404: unlike a ticket id, the
 * existence of an admin endpoint is not a secret, and a 404 here would send someone
 * hunting for a typo in a URL that is perfectly correct.
 */
export async function requireApiRole(
  role: MITSRole,
  request: Request,
): Promise<{ user: SessionUser } | { response: Response }> {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth;

  if (!hasAtLeast(auth.user.role, role)) {
    return {
      response: Response.json(
        { error: "Für diese Aktion fehlen die Rechte." },
        { status: 403 },
      ),
    };
  }

  return auth;
}

/**
 * Page guard with a role floor.
 *
 * An authenticated user who lacks the role is not sent to the login form —
 * re-authenticating would not help and reads as a broken login loop. Where they
 * go instead depends on the path: a reporter who follows a link into `/mits`
 * belongs in their own portal, everything else lands on `/forbidden`.
 *
 * `deniedTo` overrides that decision for a caller that knows better; without it
 * the path in `returnTo` decides, which is the path being guarded.
 */
export async function requireRole(
  role: MITSRole,
  returnTo?: string,
  deniedTo?: string,
): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!hasAtLeast(user.role, role)) {
    redirect(deniedTo ?? (returnTo ? deniedPathFor(returnTo) : "/forbidden"));
  }
  return user;
}

/**
 * Page guard for a surface an admin may have taken away from this role.
 *
 * A different question from `requireRole`, and it comes **after** it: that one
 * asks whether the role may be here at all, this one whether the instance still
 * offers the area to it. Both run — the visibility settings are a narrowing on
 * top of the role model, never a replacement for it.
 *
 * The target is the role's own home, not `/forbidden`. Nothing was forbidden:
 * the instance does not offer this area to this role, which is the same
 * distinction `deniedPathFor` makes for a reporter who follows a link into
 * `/mits`. Never the area itself, or it would be a loop — which is why
 * `/customer` and `/mits` carry no `NavArea` and cannot be switched off.
 *
 * Lives here rather than beside `canSeeArea` because `next/navigation` may not
 * be imported into `lib/role-visibility.ts` — see the note there.
 */
export function requireArea(area: NavArea, role: unknown): void {
  if (!canSeeArea(role, area)) {
    redirect(homeFor(role));
  }
}
