"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { importConfigurationItems, type ImportSummary } from "@/lib/cmdb-import";
import { isFeatureEnabled } from "@/lib/features";

/* ──────────────────────────────────────────────────────────────────────────
   CMDB import.

   Admin only, not technician: an import rewrites existing records in bulk, which is a
   different kind of act from correcting one asset. Re-checked here rather than trusted
   from the page — a Server Action is reachable without it.
   ────────────────────────────────────────────────────────────────────────── */

export type ImportActionResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

/**
 * Roughly a megabyte of text.
 *
 * Not a security boundary — the point is that a mis-dropped disk image would otherwise
 * be parsed character by character in a request. An eight-hundred-row asset export is
 * some tens of kilobytes, so the limit is far above any real file.
 */
const MAX_IMPORT_CHARS = 1_000_000;

export async function importCMDBAction(
  _previous: ImportActionResult | null,
  formData: FormData,
): Promise<ImportActionResult> {
  await requireRole("admin");

  if (!isFeatureEnabled("feature_cmdb")) {
    return { ok: false, error: "Die CMDB ist abgeschaltet." };
  }

  const text = String(formData.get("text") ?? "");
  if (!text.trim()) return { ok: false, error: "Keine Daten übergeben." };
  if (text.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: "Die Datei ist zu groß für einen Import." };
  }

  let mapping: Record<string, string>;
  try {
    const raw = JSON.parse(String(formData.get("mapping") ?? "{}")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("shape");
    }
    mapping = Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([column, target]) => [
        column,
        String(target),
      ]),
    );
  } catch {
    return { ok: false, error: "Die Spaltenzuordnung konnte nicht gelesen werden." };
  }

  if (!Object.values(mapping).includes("name")) {
    return {
      ok: false,
      error: "Eine Spalte muss der Bezeichnung zugeordnet sein.",
    };
  }

  const delimiter = String(formData.get("delimiter") ?? "");
  const summary = importConfigurationItems(
    text,
    mapping,
    // A single character or nothing; anything else is a client sending noise.
    delimiter.length === 1 ? delimiter : undefined,
  );

  revalidatePath("/mits/cmdb");
  revalidatePath("/mits/cmdb/licenses");

  return { ok: true, summary };
}
