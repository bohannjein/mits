import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { hasAtLeast, requiredRoleFor, toRole } from "@/lib/auth/roles";
import { authSecret } from "@/lib/auth/secret";

/* ──────────────────────────────────────────────────────────────────────────
   Route gate (Next 16 renamed `middleware` to `proxy`).

   This is a *fast path*, not the security boundary. The Next.js docs are blunt
   about it: a matcher change or a moved Server Function silently removes proxy
   coverage, so authorization has to be re-checked where the work happens. Every
   protected page calls `requireRole` and every route handler re-reads the
   session from the database — see `lib/auth/session.ts`.

   What this buys us: an unauthenticated visitor gets a redirect instead of a
   rendered shell, and an under-privileged user is turned away before the page
   renders.
   ────────────────────────────────────────────────────────────────────────── */

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const required = requiredRoleFor(pathname);
  if (!required) return NextResponse.next();

  // Cheap check first: no session cookie at all means no session, no database
  // round-trip needed.
  if (!getSessionCookie(request)) {
    return redirectToLogin(request, `${pathname}${search}`);
  }

  if (required === "user") return NextResponse.next();

  // The role lives in Better Auth's signed session-cache cookie. `getCookieCache`
  // verifies the HMAC with the same secret the server signs with, so a forged
  // cookie fails here rather than granting a role.
  const cached = await getCookieCache(request, { secret: authSecret() }).catch(
    () => null,
  );

  // Cache miss or expiry is not a denial: we simply cannot decide here, so the
  // request continues and the page guard makes the authoritative call. Blocking
  // on a miss would log people out every time the 60s cache lapses.
  if (!cached?.user) return NextResponse.next();

  if (!hasAtLeast(toRole((cached.user as { role?: unknown }).role), required)) {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, returnTo: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", returnTo);
  return NextResponse.redirect(url);
}

// Explicit prefixes instead of a negative lookahead: nothing static is matched,
// so no chance of the gate accidentally swallowing CSS or images.
export const config = {
  matcher: ["/admin/:path*", "/board/:path*", "/tickets/:path*"],
};
