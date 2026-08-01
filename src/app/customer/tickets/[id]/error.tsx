"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

/** Same boundary on the reporter's side; the same page re-renders live there. */
export default function CustomerTicketError({
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
