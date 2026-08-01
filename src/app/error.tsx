"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

/**
 * The application-wide error boundary.
 *
 * App Router boundaries catch **server render errors too** — Next forwards them
 * to the nearest `error.tsx` with a digest. That is why this file, and not
 * `react-error-boundary`: a client-side boundary can only ever catch what throws
 * in the browser, and the failure being chased here happens while the page is
 * being rendered on the server.
 *
 * It replaces the built-in "A server error occurred" screen, which offers a
 * reload and no information. This one retries in place and names the digest.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} reset={reset} />;
}
