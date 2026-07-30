import "server-only";

import { db } from "@/lib/db/sqlite";
import { BUILTIN_SCHEMAS, QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import { parseFormSchema, type MITSFormSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Form schema store.

   Built-in schemas live in code and are always available — a fresh instance is
   usable before anyone opens the builder. A row in `mits_form_schema` with the
   same id overrides its built-in, which is how the builder edits one without
   touching the source.
   ────────────────────────────────────────────────────────────────────────── */

interface SchemaRow {
  id: string;
  definition: string;
  updated_at: string;
  updated_by: string | null;
}

export interface StoredSchemaInfo {
  schema: MITSFormSchema;
  /** True when this id also exists in code. */
  builtIn: boolean;
  /** True when a database row is in effect. */
  overridden: boolean;
  updatedAt?: string;
}

const BUILTIN_IDS = new Set(BUILTIN_SCHEMAS.map((schema) => schema.id));

export const isBuiltInSchema = (id: string) => BUILTIN_IDS.has(id);

function readRows(): Map<string, { schema: MITSFormSchema; updatedAt: string }> {
  const rows = db
    .prepare("SELECT id, definition, updated_at, updated_by FROM mits_form_schema")
    .all() as SchemaRow[];

  const stored = new Map<string, { schema: MITSFormSchema; updatedAt: string }>();
  for (const row of rows) {
    try {
      stored.set(row.id, {
        schema: parseFormSchema(JSON.parse(row.definition)),
        updatedAt: row.updated_at,
      });
    } catch {
      // A row that no longer parses must not take the catalogue down. It is
      // skipped; the built-in (if any) keeps working and the builder can fix it.
      continue;
    }
  }
  return stored;
}

/** Every schema in effect: built-ins, with database rows layered on top. */
export function listFormSchemas(): MITSFormSchema[] {
  const stored = readRows();
  const merged = BUILTIN_SCHEMAS.map(
    (builtin) => stored.get(builtin.id)?.schema ?? builtin,
  );
  for (const [id, entry] of stored) {
    if (!BUILTIN_IDS.has(id)) merged.push(entry.schema);
  }
  return merged;
}

/** Same list, annotated for the admin views. */
export function listSchemaInfos(): StoredSchemaInfo[] {
  const stored = readRows();
  const infos: StoredSchemaInfo[] = BUILTIN_SCHEMAS.map((builtin) => {
    const entry = stored.get(builtin.id);
    return {
      schema: entry?.schema ?? builtin,
      builtIn: true,
      overridden: Boolean(entry),
      updatedAt: entry?.updatedAt,
    };
  });
  for (const [id, entry] of stored) {
    if (BUILTIN_IDS.has(id)) continue;
    infos.push({
      schema: entry.schema,
      builtIn: false,
      overridden: true,
      updatedAt: entry.updatedAt,
    });
  }
  return infos;
}

export function getFormSchema(id: string | null | undefined): MITSFormSchema | undefined {
  if (!id) return undefined;
  return listFormSchemas().find((schema) => schema.id === id);
}

/** The guided catalogue: everything except the free-text fallback. */
export function listCatalogSchemas(): MITSFormSchema[] {
  return listFormSchemas().filter((schema) => schema.id !== QUICK_TICKET_SCHEMA.id);
}

export function saveFormSchema(schema: MITSFormSchema, userId: string): void {
  db.prepare(
    `INSERT INTO mits_form_schema (id, definition, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       definition = excluded.definition,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(schema.id, JSON.stringify(schema), new Date().toISOString(), userId);
}

/**
 * Drop the stored row. For a built-in id this reverts to the version in code
 * rather than removing the form — the catalogue never loses an entry this way.
 */
export function deleteStoredSchema(id: string): void {
  db.prepare("DELETE FROM mits_form_schema WHERE id = ?").run(id);
}
