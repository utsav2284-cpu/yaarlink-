"use client";

import ErrorRecovery from "@/frontend/components/ErrorRecovery";

/**
 * Route-level error boundary. Catches render and data errors thrown below the
 * root layout so the visitor keeps the navbar, footer and language context
 * instead of seeing an unstyled fallback page.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRecovery error={error} reset={reset} />;
}
