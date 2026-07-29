/**
 * End-to-end checks for registration, RBAC and ticket isolation.
 *
 * Runs against a live server. Start one against a throwaway data directory first:
 *
 *   MITS_DATA_DIR=.tmp-e2e BETTER_AUTH_SECRET=<32+ chars> npx next dev -p 3100
 *   MITS_DATA_DIR=.tmp-e2e MITS_E2E_URL=http://localhost:3100 npm run test:auth
 *
 * The script needs the same MITS_DATA_DIR as the server: a few checks flip admin
 * settings directly in the database, which is the only way to exercise the
 * registration policy without driving a server action over HTTP.
 */
import Database from "better-sqlite3";
import { join } from "node:path";

/**
 * Write the same `mits_setting` row the admin action writes. `lib/settings` itself
 * is `server-only`, which throws outside a bundler, so the row is written directly.
 */
function setPolicy(registrationEnabled: boolean, allowedEmailDomains: string[]) {
  const file = join(process.env.MITS_DATA_DIR ?? "data", "mits.db");
  const database = new Database(file);
  try {
    database
      .prepare(
        `INSERT INTO mits_setting (key, value) VALUES ('auth', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify({ registrationEnabled, allowedEmailDomains }));
  } finally {
    database.close();
  }
}

const BASE = process.env.MITS_E2E_URL ?? "http://localhost:3100";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal cookie jar: Node's fetch does not keep cookies between calls. */
class Session {
  private cookies = new Map<string, string>();

  constructor(readonly label: string) {}

  private header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || /max-age=0/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.header();
    if (cookie) headers.set("cookie", cookie);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    // Better Auth rejects state-changing requests without a trusted Origin
    // ("Missing or null Origin"). A browser always sends one, so the driver must
    // too — otherwise the run measures the CSRF guard instead of the app.
    headers.set("origin", new URL(BASE).origin);

    const response = await fetch(new URL(path, BASE), {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      redirect: "manual",
    });
    this.absorb(response);
    return response;
  }

  async json<T = unknown>(path: string, init?: RequestInit & { json?: unknown }) {
    const response = await this.request(path, init);
    const body = (await response.json().catch(() => null)) as T | null;
    return { status: response.status, body, response };
  }
}

async function signUp(
  session: Session,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: { message?: string } | null }> {
  const { status, body } = await session.json<{ message?: string }>(
    "/api/auth/sign-up/email",
    { method: "POST", json: payload },
  );
  return { status, body };
}

async function currentRole(session: Session): Promise<string | null> {
  const { body } = await session.json<{ user?: { role?: string } }>(
    "/api/auth/get-session",
  );
  return body?.user?.role ?? null;
}

/** Where an unauthenticated or under-privileged navigation ends up. */
async function landing(session: Session, path: string) {
  const response = await session.request(path);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
  };
}

const PASSWORD = "correct-horse-battery";

console.log(`server: ${BASE}`);

// Touch an auth endpoint first: the server creates the data directory, opens the
// database and runs the Better Auth migrations on its first request. Writing the
// policy row before that would hit a database that does not exist yet.
await fetch(new URL("/api/auth/get-session", BASE)).catch(() => null);

// Reset the policy so a re-run starts from a known state.
setPolicy(true, []);

console.log("\nbootstrap: first account becomes admin");
const admin = new Session("admin");
{
  const { status, body } = await signUp(admin, {
    name: "Ada Admin",
    email: "ada@firma.de",
    password: PASSWORD,
  });
  check("sign-up succeeds", status === 200, `HTTP ${status} ${body?.message ?? ""}`);
  check("first user is admin", (await currentRole(admin)) === "admin");
}

console.log("\nprivilege escalation at sign-up");
const attacker = new Session("attacker");
{
  await signUp(attacker, {
    name: "Eve",
    email: "eve@firma.de",
    password: PASSWORD,
    role: "admin",
  });
  const role = await currentRole(attacker);
  check(
    "client-supplied role is ignored",
    role === "user",
    `role came out as ${role}`,
  );
}

console.log("\nplain user");
const user = new Session("user");
{
  const { status, body } = await signUp(user, {
    name: "Uwe User",
    email: "uwe@firma.de",
    password: PASSWORD,
  });
  check("sign-up succeeds", status === 200, `HTTP ${status} ${body?.message ?? ""}`);
  check("role is user", (await currentRole(user)) === "user");
}

console.log("\nroute gates");
{
  const anon = new Session("anon");
  const anonTickets = await landing(anon, "/tickets/new");
  check(
    "anonymous /tickets/new redirects to /login",
    anonTickets.status === 307 && anonTickets.location.includes("/login"),
    `HTTP ${anonTickets.status} -> ${anonTickets.location}`,
  );

  const anonAdmin = await landing(anon, "/admin");
  check(
    "anonymous /admin redirects to /login",
    anonAdmin.status === 307 && anonAdmin.location.includes("/login"),
    `HTTP ${anonAdmin.status} -> ${anonAdmin.location}`,
  );

  const userAdmin = await landing(user, "/admin");
  check(
    "user /admin is refused",
    userAdmin.location.includes("/forbidden"),
    `HTTP ${userAdmin.status} -> ${userAdmin.location}`,
  );

  const userBoard = await landing(user, "/board");
  check(
    "user /board is refused",
    userBoard.location.includes("/forbidden"),
    `HTTP ${userBoard.status} -> ${userBoard.location}`,
  );

  const adminBoard = await landing(admin, "/board");
  check("admin /board renders", adminBoard.status === 200, `HTTP ${adminBoard.status}`);

  const adminDesk = await landing(admin, "/admin");
  check("admin /admin renders", adminDesk.status === 200, `HTTP ${adminDesk.status}`);

  const userOwn = await landing(user, "/tickets");
  check("user /tickets renders", userOwn.status === 200, `HTTP ${userOwn.status}`);
}

console.log("\nticket API");
{
  const anon = new Session("anon");
  const anonPost = await anon.json("/api/tickets", {
    method: "POST",
    json: { source: "legacy", form_schema_id: "quick-ticket", payload: {} },
  });
  check("anonymous POST is 401", anonPost.status === 401, `HTTP ${anonPost.status}`);

  const anonGet = await anon.json("/api/tickets");
  check("anonymous GET is 401", anonGet.status === 401, `HTTP ${anonGet.status}`);

  const validPayload = {
    title: "Drucker Etage 3 offline",
    priority: "high",
    description: "Seit heute Morgen nicht erreichbar, Fehler 0x83 auf dem Display.",
    attachments: [],
  };

  const created = await user.json<{ ticket?: { id: string; created_by: string } }>(
    "/api/tickets",
    {
      method: "POST",
      json: {
        source: "legacy",
        form_schema_id: "quick-ticket",
        priority: "high",
        payload: validPayload,
        // Forged ownership: must be ignored in favour of the session.
        created_by: "some-other-user-id",
      },
    },
  );
  check("user creates a ticket", created.status === 201, `HTTP ${created.status}`);
  const userTicketId = created.body?.ticket?.id ?? "";

  const userSessionId = (
    await user.json<{ user?: { id: string } }>("/api/auth/get-session")
  ).body?.user?.id;
  check(
    "forged created_by is overridden by the session",
    created.body?.ticket?.created_by === userSessionId,
    `${created.body?.ticket?.created_by} vs ${userSessionId}`,
  );

  const badPayload = await user.json("/api/tickets", {
    method: "POST",
    json: {
      source: "legacy",
      form_schema_id: "quick-ticket",
      payload: { title: "zu", priority: "high", description: "kurz" },
    },
  });
  check(
    "payload violating the schema is rejected",
    badPayload.status === 422,
    `HTTP ${badPayload.status}`,
  );

  const unknownProperty = await user.json("/api/tickets", {
    method: "POST",
    json: {
      source: "legacy",
      form_schema_id: "quick-ticket",
      payload: { ...validPayload, injected: "surprise" },
    },
  });
  check(
    "unknown payload property is rejected (strictObject)",
    unknownProperty.status === 422,
    `HTTP ${unknownProperty.status}`,
  );

  const unknownSchema = await user.json("/api/tickets", {
    method: "POST",
    json: { source: "wizard", form_schema_id: "does-not-exist", payload: {} },
  });
  check(
    "unknown form schema is rejected",
    unknownSchema.status === 422,
    `HTTP ${unknownSchema.status}`,
  );

  // The attacker files one too, so the isolation check has something to miss.
  await attacker.json("/api/tickets", {
    method: "POST",
    json: {
      source: "legacy",
      form_schema_id: "quick-ticket",
      payload: {
        title: "Eves eigenes Anliegen",
        priority: "low",
        description: "Ein Ticket, das andere Nutzer nicht sehen dürfen.",
        attachments: [],
      },
    },
  });

  const userList = await user.json<{ tickets?: { id: string }[] }>("/api/tickets");
  const userTickets = userList.body?.tickets ?? [];
  check(
    "user sees exactly one ticket — their own",
    userTickets.length === 1 && userTickets[0]?.id === userTicketId,
    `got ${userTickets.length} ticket(s)`,
  );

  const attackerList = await attacker.json<{ tickets?: { id: string }[] }>(
    "/api/tickets",
  );
  const attackerTickets = attackerList.body?.tickets ?? [];
  check(
    "foreign ticket is not in the other user's list",
    attackerTickets.length > 0 &&
      !attackerTickets.some((ticket) => ticket.id === userTicketId),
    `got ${attackerTickets.length} ticket(s)`,
  );

  const adminList = await admin.json<{ tickets?: { id: string }[] }>("/api/tickets");
  const adminTickets = adminList.body?.tickets ?? [];
  check(
    "admin sees every ticket",
    adminTickets.length >= 2,
    `got ${adminTickets.length} ticket(s)`,
  );
}

console.log("\nregistration policy");
{
  setPolicy(false, []);
  const blocked = await signUp(new Session("blocked"), {
    name: "Nope",
    email: "nope@firma.de",
    password: PASSWORD,
  });
  check(
    "sign-up refused while registration is off",
    blocked.status === 403,
    `HTTP ${blocked.status}`,
  );

  setPolicy(true, ["firma.de"]);

  const wrongDomain = await signUp(new Session("wrong-domain"), {
    name: "Extern",
    email: "extern@fremd.de",
    password: PASSWORD,
  });
  check(
    "sign-up refused for a non-whitelisted domain",
    wrongDomain.status === 403,
    `HTTP ${wrongDomain.status}`,
  );

  const lookalike = await signUp(new Session("lookalike"), {
    name: "Lookalike",
    email: "mallory@nichtfirma.de",
    password: PASSWORD,
  });
  check(
    "suffix lookalike domain refused",
    lookalike.status === 403,
    `HTTP ${lookalike.status}`,
  );

  const smuggled = await signUp(new Session("smuggled"), {
    name: "Smuggler",
    email: "mallory@firma.de@fremd.de",
    password: PASSWORD,
  });
  check(
    // Better Auth's own address validation rejects this before the policy hook
    // ever sees it, so the exact status is 400 rather than 403 — either way the
    // account is not created.
    "allowed domain in the local part refused",
    smuggled.status >= 400,
    `HTTP ${smuggled.status}`,
  );

  const allowed = await signUp(new Session("allowed"), {
    name: "Intern",
    email: "intern@firma.de",
    password: PASSWORD,
  });
  check(
    "sign-up allowed for a whitelisted domain",
    allowed.status === 200,
    `HTTP ${allowed.status}`,
  );

  setPolicy(true, []);
}

console.log("\nsign-out");
{
  await user.request("/api/auth/sign-out", { method: "POST", json: {} });
  const after = await landing(user, "/tickets");
  check(
    "session is gone after sign-out",
    after.location.includes("/login"),
    `HTTP ${after.status} -> ${after.location}`,
  );
}

console.log(
  failures === 0
    ? `\nALL ${checks} CHECKS PASSED`
    : `\n${failures} of ${checks} CHECKS FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
