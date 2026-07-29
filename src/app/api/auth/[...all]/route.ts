import { toNextJsHandler } from "better-auth/next-js";

import { auth, ensureAuthSchema } from "@/lib/auth/server";

/* Better Auth's own endpoints: /api/auth/sign-up/email, /sign-in/email,
   /sign-out, /get-session, … The schema bootstrap runs before the first request
   is handled so a fresh clone works without a manual migration step. */

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureAuthSchema();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await ensureAuthSchema();
  return handler.POST(request);
}
