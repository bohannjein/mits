"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

/**
 * The ticket page's own boundary.
 *
 * Closer than the application-wide one on purpose: this page re-renders on every
 * realtime signal, so it is the one place where a transient failure is likely to
 * be hit repeatedly — and where losing the whole screen for it is most
 * expensive. Scoped here, a retry redraws the ticket rather than the session.
 */
export default function TicketError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      error={error}
      reset={reset}
      title="Dieses Ticket konnte nicht geladen werden."
    />
  );
}
