import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { hasAtLeast, toRole, type MITSRole } from "@/lib/auth/roles";
import { auth, ensureAuthSchema } from "@/lib/auth/server";

/* ──────────────────────────────────────────────────────────────────────────
   Authoritative session access.

   The Next.js docs are explicit that the proxy is not a security boundary — a
   refactor that moves a Server Function or changes a matcher silently removes
   proxy coverage. Every protected page and every route handler therefore calls
   one of these helpers, which hit the database rather than trusting a cookie.
   ────────────────────────────────────────────────────────────────────────── */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: MITSRole;
  emailVerified: boolean;
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
  };
}

/** Current user from the request headers, or null. Never throws on a bad cookie. */
export async function getSessionUser(): Promise<SessionUser | null> {
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ? toSessionUser(session.user) : null;
}

/** Same, but for route handlers that already hold the Request. */
export async function getSessionUserFor(
  request: Request,
): Promise<SessionUser | null> {
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ? toSessionUser(session.user) : null;
}

/** Page guard: redirects to the login form, preserving where the user wanted to go. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/login${target}`);
  }
  return user;
}

/**
 * Page guard with a role floor. An authenticated user who lacks the role is sent
 * to /forbidden rather than to the login form — re-authenticating would not help
 * and looks like a broken login loop.
 */
export async function requireRole(
  role: MITSRole,
  returnTo?: string,
): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!hasAtLeast(user.role, role)) {
    redirect("/forbidden");
  }
  return user;
}
