import { z } from "zod";

/* ──────────────────────────────────────────────────────────────────────────
   Client side of the AI triage call.

   The browser posts only what the user supplied. Which form schemas the router
   may choose from is decided server-side in /api/ai/triage — otherwise a client
   could offer the model a schema of its own making.
   ────────────────────────────────────────────────────────────────────────── */

export const TriageResultSchema = z.object({
  /** Id of the MITSFormSchema the router picked. */
  suggested_category_id: z.string(),
  /** 0–1. Shown to the user; low values are not hidden. */
  confidence: z.number().min(0).max(1),
  /** Field values for that form. Still filtered and validated before use. */
  extracted_payload: z.record(z.string(), z.unknown()),
  /** Short reply to the reporting person. */
  auto_reply: z.string(),
  /** What the vision model read out of the screenshots, if any. */
  transcribed_text: z.string().nullable().optional(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export type TriageOutcome =
  | { status: "ok"; result: TriageResult }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export interface TriageInput {
  prompt: string;
  /** Screenshots as base64 (no data-URL prefix needed; the backend strips it). */
  images: string[];
}

/**
 * Run the triage. Never throws: every failure comes back as a message the chat
 * can show, because "the model is unreachable" is normal operating information,
 * not an exception.
 */
export async function requestTriage(input: TriageInput): Promise<TriageOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/ai/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return {
      status: "error",
      message: "Die Analyse konnte nicht gestartet werden — keine Verbindung zum Server.",
    };
  }

  if (response.status === 401) return { status: "unauthenticated" };

  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Die Analyse ist fehlgeschlagen (HTTP ${response.status}).`;
    return { status: "error", message };
  }

  const parsed = TriageResultSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Die Antwort der KI hatte ein unerwartetes Format.",
    };
  }

  return { status: "ok", result: parsed.data };
}

/** Read a file as bare base64, without the `data:...;base64,` prefix. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} konnte nicht gelesen werden.`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
