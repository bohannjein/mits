import { canAdminister } from "@/lib/auth/roles";
import { serviceToken } from "@/lib/auth/secret";
import { getSessionUserFor } from "@/lib/auth/session";
import { isSafeOllamaUrl } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Backs the model dropdowns and the "test connection" button in
   /admin/settings/ai.

   Admin only, and it asks the AI backend rather than Ollama directly: the web
   container cannot be assumed to reach Ollama, while the backend can — that is
   the whole reason it exists.
   ────────────────────────────────────────────────────────────────────────── */

const BACKEND_URL = (
  process.env.MITS_BACKEND_URL?.trim() || "http://localhost:8000"
).replace(/\/+$/, "");

export async function POST(request: Request) {
  const user = await getSessionUserFor(request);
  if (!user) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  if (!canAdminister(user.role)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const token = serviceToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const candidate =
    body && typeof body === "object" && "ollamaBaseUrl" in body
      ? String((body as { ollamaBaseUrl: unknown }).ollamaBaseUrl ?? "")
      : "";

  // An empty value is allowed — the backend then probes its own fallback.
  if (candidate.trim() && !isSafeOllamaUrl(candidate)) {
    return Response.json(
      { error: "Die URL muss mit http:// oder https:// beginnen." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/v1/models`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MITS-Service-Token": token,
      },
      body: JSON.stringify({ ollama_base_url: candidate.trim() }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json(
      { error: "Der KI-Dienst ist nicht erreichbar." },
      { status: 502 },
    );
  }

  const payload = (await upstream.json().catch(() => null)) as
    | { detail?: unknown; models?: unknown; ollama_base_url?: unknown }
    | null;

  if (!upstream.ok) {
    // FastAPI reports errors as `detail`; the UI expects `error`.
    const detail =
      payload && typeof payload.detail === "string"
        ? payload.detail
        : `Der KI-Dienst antwortete mit HTTP ${upstream.status}.`;
    return Response.json({ error: detail }, { status: upstream.status });
  }

  return Response.json({
    ollamaBaseUrl: String(payload?.ollama_base_url ?? ""),
    models: Array.isArray(payload?.models) ? payload.models.map(String) : [],
  });
}
