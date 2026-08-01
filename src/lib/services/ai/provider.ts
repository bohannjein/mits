import "server-only";

import {
  AI_PROVIDER_ENDPOINTS,
  isAIModelReady,
  type AIProvider,
  type AISettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One way to ask a model for a JSON object.

   Three providers, one function. Everything above this file — clustering,
   summaries, routing — states a prompt and a JSON schema and gets a validated
   object back; none of them knows which service answered.

   **Why `fetch` and not three SDKs.** The three official clients are tens of
   megabytes of transitive dependencies, and what MITS needs from each is a single
   POST with a structured-output directive. The directive is the only genuinely
   different part, and it is nine lines per provider — see `buildRequest`.

   **Structured output is required, not requested.** Every provider here is asked
   to conform to a schema at the API level rather than "please answer in JSON":
   Ollama's `format`, OpenAI's `json_schema` response format, Anthropic's forced
   tool call. A model that free-writes JSON produces something unparseable often
   enough that the failure becomes the feature's normal state.

   **Nothing here decides whether to call.** That is `isAIFeatureOn`, checked by
   the caller. This module refuses when it *cannot* call — no key, no model — and
   the distinction matters: "switched off" is a setting, "misconfigured" is an
   error somebody has to see.
   ────────────────────────────────────────────────────────────────────────── */

export class AIProviderError extends Error {}

/**
 * Per request. Generous enough for a summary of a long thread on a local GPU,
 * short enough that an agent pressing a button is not left staring at a spinner —
 * and the callers all treat a timeout as "no result", never as a failed action.
 */
const TIMEOUT_MS = 45_000;

/** Cap on what a model may write back. A runaway generation is not an answer. */
const MAX_OUTPUT_TOKENS = 1200;

export interface AIRequest {
  /** What the model is, in one or two sentences. Kept out of the user content. */
  system: string;
  /** The task plus the material. Everything user-supplied belongs in here. */
  prompt: string;
  /** JSON Schema the answer must conform to. */
  schema: Record<string, unknown>;
  /** Name for the schema. Anthropic needs it; the others ignore it. */
  schemaName: string;
}

const endpointFor = (settings: AISettings): string => {
  const raw =
    settings.provider === "ollama"
      ? settings.ollamaBaseUrl || AI_PROVIDER_ENDPOINTS.ollama
      : settings.baseUrl || AI_PROVIDER_ENDPOINTS[settings.provider];
  return raw.trim().replace(/\/+$/, "");
};

interface WireRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Pulls the JSON payload out of this provider's response envelope. */
  extract: (payload: unknown) => string | null;
}

function buildRequest(settings: AISettings, request: AIRequest): WireRequest {
  const base = endpointFor(settings);
  const model = settings.textModel.trim();
  const key = settings.apiKey.trim();

  const provider: AIProvider = settings.provider;

  if (provider === "ollama") {
    return {
      url: `${base}/api/chat`,
      headers: { "Content-Type": "application/json" },
      body: {
        model,
        stream: false,
        // A JSON Schema in `format` makes Ollama constrain decoding to it, which
        // is what turns "usually valid JSON" into "valid JSON".
        format: request.schema,
        options: { temperature: 0, num_predict: MAX_OUTPUT_TOKENS },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      },
      extract: (payload) =>
        (payload as { message?: { content?: string } })?.message?.content ?? null,
    };
  }

  if (provider === "openai") {
    return {
      url: `${base}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: {
        model,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            // `strict` is what makes the schema binding rather than advisory. It
            // also forbids optional properties, which is why every schema in this
            // codebase lists all of its keys as required.
            strict: true,
            schema: request.schema,
          },
        },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      },
      extract: (payload) =>
        (payload as { choices?: { message?: { content?: string } }[] })
          ?.choices?.[0]?.message?.content ?? null,
    };
  }

  /*
   * Anthropic has no JSON mode. The documented way to get a schema-shaped answer
   * is a tool the model is forced to call: `tool_choice` names it, so the reply is
   * a `tool_use` block whose `input` already conforms.
   */
  return {
    url: `${base}/v1/messages`,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: request.system,
      tools: [
        {
          name: request.schemaName,
          description: "Gib das Ergebnis in dieser Struktur zurück.",
          input_schema: request.schema,
        },
      ],
      tool_choice: { type: "tool", name: request.schemaName },
      messages: [{ role: "user", content: request.prompt }],
    },
    extract: (payload) => {
      const blocks = (payload as { content?: { type?: string; input?: unknown }[] })
        ?.content;
      const call = blocks?.find((block) => block.type === "tool_use");
      // Already an object here, unlike the other two — re-serialised so the caller
      // has one shape to parse.
      return call?.input === undefined ? null : JSON.stringify(call.input);
    },
  };
}

/**
 * Ask the configured model for one JSON object.
 *
 * Returns the parsed value untyped; the caller validates it with zod. That split
 * is deliberate — a provider that returns a schema-shaped object is still a
 * provider that *can* return something else, and a cast here would push the lie
 * into four call sites.
 */
export async function completeJson(
  settings: AISettings,
  request: AIRequest,
): Promise<unknown> {
  if (!isAIModelReady(settings)) {
    throw new AIProviderError(
      "Kein Modell konfiguriert — Anbieter, Modellname und gegebenenfalls API-Schlüssel prüfen.",
    );
  }

  const wire = buildRequest(settings, request);

  let response: Response;
  try {
    response = await fetch(wire.url, {
      method: "POST",
      headers: wire.headers,
      body: JSON.stringify(wire.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // A timeout and a refused connection are the same thing to the caller: no
    // answer. The message says which, because one is a slow model and the other is
    // a wrong address.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `Zeitüberschreitung nach ${TIMEOUT_MS / 1000} s`
        : "Der Dienst ist nicht erreichbar";
    throw new AIProviderError(`${reason} (${endpointFor(settings)}).`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    /*
     * Truncated hard. A provider error body can be a page of HTML from a proxy,
     * and it can echo the request — which would put the customer's ticket text
     * into an admin-facing error message.
     */
    throw new AIProviderError(
      `Der Dienst antwortete mit HTTP ${response.status}${
        detail ? `: ${detail.slice(0, 200)}` : ""
      }.`,
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const content = payload === null ? null : wire.extract(payload);
  if (!content) {
    throw new AIProviderError("Die Antwort des Dienstes war leer.");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new AIProviderError("Die Antwort des Dienstes war kein gültiges JSON.");
  }
}

/**
 * Round-trip check for the settings mask.
 *
 * Asks for a trivial structured answer rather than listing models: what an admin
 * needs to know is whether *this* model can be reached and will honour a schema,
 * and a reachable endpoint whose configured model does not exist passes a list
 * call and fails every real request.
 */
export async function verifyAIProvider(settings: AISettings): Promise<string> {
  const answer = await completeJson(settings, {
    system: "Du antwortest ausschließlich in der vorgegebenen Struktur.",
    prompt: "Antworte mit ok = true.",
    schemaName: "mits_connection_test",
    schema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    },
  });

  if ((answer as { ok?: unknown })?.ok !== true) {
    throw new AIProviderError(
      "Der Dienst antwortet, hält sich aber nicht an die vorgegebene Struktur. Ein anderes Modell wählen.",
    );
  }

  return `„${settings.textModel}“ antwortet und liefert strukturierte Ausgaben.`;
}
