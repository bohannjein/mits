import { toNextJsHandler } from "better-auth/next-js";

import { ensureAuthSchema, getAuth } from "@/lib/auth/server";

/* Better Auth's own endpoints: /api/auth/sign-up/email, /sign-in/email,
   /sign-out, /get-session, … The schema bootstrap runs before the first request
   is handled so a fresh clone works without a manual migration step.

   The handler is built per request rather than once at module scope: the instance
   behind it is tied to the configured session lifetime, and a handler captured at
   import time would keep serving the value that was set when the process started.
   `toNextJsHandler` only wraps `auth.handler`, so this costs an object. */

export async function GET(request: Request) {
  await ensureAuthSchema();
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  await ensureAuthSchema();
  return toNextJsHandler(getAuth()).POST(request);
}
