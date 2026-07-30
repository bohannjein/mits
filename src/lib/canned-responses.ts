import "server-only";

import { z } from "zod";

import { db } from "@/lib/db/sqlite";
import { CannedResponseSchema, type CannedResponse } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Canned responses.

   A JSON blob in `mits_setting`, like the portal lists: a short admin-edited list
   read on the ticket page. No table, no migration.

   Unlike the FAQ there are no built-in defaults. A shipped canned response would
   be an answer in a voice nobody at this site chose, sent to their colleagues.
   ────────────────────────────────────────────────────────────────────────── */

const KEY = "canned_responses";
const ListSchema = z.array(CannedResponseSchema);

export function listCannedResponses(): CannedResponse[] {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(KEY) as { value: string } | undefined;

  if (!row) return [];

  const parsed = ListSchema.safeParse(safeJsonParse(row.value));
  if (!parsed.success) return [];

  return [...parsed.data].sort((a, b) => a.order_index - b.order_index);
}

export function setCannedResponses(next: CannedResponse[]): CannedResponse[] {
  // Position in the submitted list is the order, so the editor never has to keep
  // the index consistent while rows move.
  const responses = ListSchema.parse(
    next.map((entry, index) => ({ ...entry, order_index: index })),
  );

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, JSON.stringify(responses));

  return responses;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
