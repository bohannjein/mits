import { z } from "zod";

import { getEffectiveAISettings } from "@/lib/ai-settings";
import { serviceToken } from "@/lib/auth/secret";
import { getSessionUserFor } from "@/lib/auth/session";
import { listFormSchemas } from "@/lib/form-schemas";

/* ──────────────────────────────────────────────────────────────────────────
   Session-checked gateway to the FastAPI triage service.

   The browser never talks to the backend directly: the service token would have
   to be shipped to the client, and the AI endpoint would lose the session check.
   This route holds the token, verifies the caller, and decides which form
   schemas the router is allowed to choose from.
   ────────────────────────────────────────────────────────────────────────── */

const BACKEND_URL = (
  process.env.MITS_BACKEND_URL?.trim() || "http://localhost:8000"
).replace(/\/+$/, "");

const MAX_IMAGES = 4;
/** ~8 MB of base64 per image, ~24 MB per request. */
const MAX_IMAGE_CHARS = 8 * 1024 * 1024;
const MAX_TOTAL_CHARS = 24 * 1024 * 1024;

const TriageRequestSchema = z.object({
  prompt: z.string().max(20_000).default(""),
  images: z.array(z.string()).max(MAX_IMAGES).default([]),
});

export async function POST(request: Request) {
  const user = await getSessionUserFor(request);
  if (!user) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Read from the environment, or generated once into the data dir the backend
  // shares — so there is nothing to configure for this to work.
  const token = serviceToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = TriageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Anfrage ist unvollständig oder zu groß." },
      { status: 400 },
    );
  }

  const { prompt, images } = parsed.data;

  if (!prompt.trim() && images.length === 0) {
    return Response.json(
      { error: "Bitte das Problem beschreiben oder einen Screenshot anhängen." },
      { status: 400 },
    );
  }

  if (images.some((image) => image.length > MAX_IMAGE_CHARS)) {
    return Response.json(
      { error: "Ein Screenshot ist zu groß (max. 8 MB)." },
      { status: 413 },
    );
  }
  if (images.reduce((sum, image) => sum + image.length, 0) > MAX_TOTAL_CHARS) {
    return Response.json(
      { error: "Die Screenshots sind zusammen zu groß." },
      { status: 413 },
    );
  }

  // Read fresh on every request: an admin change under /admin/settings/ai takes
  // effect immediately, without a restart or a redeploy.
  const ai = getEffectiveAISettings();

  // Assembled here so the model can only ever be offered schemas this instance
  // actually knows — built-ins plus whatever the admin builder has published.
  const schemas = listFormSchemas().map((schema) => ({
    id: schema.id,
    title: schema.title,
    category: schema.category,
    description: schema.description ?? null,
    ai_hint: schema.aiHint ?? null,
    json_schema: schema.schema,
  }));

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/v1/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MITS-Service-Token": token,
      },
      // Ollama endpoint and models are configured in the UI, so they travel with
      // the request: the backend has no access to this app's database.
      body: JSON.stringify({
        prompt,
        images,
        schemas,
        ollama_base_url: ai.ollamaBaseUrl,
        text_model: ai.textModel,
        vision_model: ai.visionModel,
      }),
      // Vision inference is slow; the backend has its own timeout and will
      // answer with 502 long before this matters.
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      {
        error: timedOut
          ? "Die Analyse hat zu lange gedauert. Bei CPU-Inferenz kann das passieren — bitte erneut versuchen."
          : "Der KI-Dienst ist nicht erreichbar.",
      },
      { status: 502 },
    );
  }

  const payload = (await upstream.json().catch(() => null)) as
    | { detail?: unknown }
    | null;

  if (!upstream.ok) {
    // FastAPI reports errors as `detail`; the UI expects `error`.
    const detail =
      payload && typeof payload.detail === "string"
        ? payload.detail
        : `Der KI-Dienst antwortete mit HTTP ${upstream.status}.`;
    return Response.json({ error: detail }, { status: upstream.status });
  }

  return Response.json(payload);
}
