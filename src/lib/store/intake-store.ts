import { create } from "zustand";

import type { MITSTicketDraft, TicketSource } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   UI state for the ticket intake.

   Deliberately only UI state: which mode is active, which catalogue schema is
   open, and the draft that was last accepted. Server state (real tickets, schema
   store) belongs to TanStack Query, not here.
   ────────────────────────────────────────────────────────────────────────── */

interface IntakeState {
  mode: TicketSource;
  /** Catalogue schema currently open in the wizard; null = tile picker. */
  selectedSchemaId: string | null;
  /** Last draft accepted by a form — stands in for a server round-trip. */
  lastDraft: MITSTicketDraft | null;

  setMode: (mode: TicketSource) => void;
  selectSchema: (id: string | null) => void;
  acceptDraft: (draft: MITSTicketDraft) => void;
  dismissDraft: () => void;
}

export const useIntakeStore = create<IntakeState>((set) => ({
  mode: "legacy",
  selectedSchemaId: null,
  lastDraft: null,

  // Switching modes closes any open catalogue form, so returning to the wizard
  // starts at the tiles rather than a half-filled form for another category.
  setMode: (mode) => set({ mode, selectedSchemaId: null, lastDraft: null }),
  selectSchema: (selectedSchemaId) => set({ selectedSchemaId, lastDraft: null }),
  acceptDraft: (lastDraft) => set({ lastDraft }),
  dismissDraft: () => set({ lastDraft: null, selectedSchemaId: null }),
}));
