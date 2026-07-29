import type { MITSFormSchema, MITSTicketDraft } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Seam for the Phase 3 AI pipeline.

   The chat UI is built against this contract now so wiring the FastAPI/Ollama
   backend later is a single implementation swap and no UI change. Nothing here
   fabricates a result: until the backend exists, every call reports that the
   service is unavailable.
   ────────────────────────────────────────────────────────────────────────── */

export interface ExtractionRequest {
  /** What the user typed. */
  text: string;
  /** Screenshots or error images the user attached. */
  images: File[];
  /** Schemas the router may choose from, with their `aiHint` descriptions. */
  candidates: MITSFormSchema[];
}

export type ExtractionResult =
  | {
      status: "ok";
      /** Schema the router picked. */
      schemaId: string;
      /** Field values to pre-fill; still validated by schemaToZod before use. */
      payload: Record<string, unknown>;
      /** 0–1 router confidence, shown to the user before they confirm. */
      confidence: number;
      draft: MITSTicketDraft;
    }
  | { status: "unavailable"; reason: string };

/**
 * Turn free text plus images into a structured ticket draft.
 *
 * Phase 3 replaces the body with a POST to the FastAPI backend, which routes via
 * Ollama and OCRs any attached scans. The signature is final; the implementation
 * is not.
 */
export async function extractTicketDraft(
  _request: ExtractionRequest,
): Promise<ExtractionResult> {
  return {
    status: "unavailable",
    reason:
      "Das KI-Backend (FastAPI + Ollama) wird in Phase 3 angebunden. Bis dahin bitte den Service-Katalog oder das Schnell-Ticket nutzen.",
  };
}
