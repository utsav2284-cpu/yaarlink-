"use client";

/**
 * Root error boundary. Next.js replaces the entire document with this component
 * when the root layout itself fails, which is why it must render its own
 * <html> and <body> and cannot rely on the app's language context or CSS.
 *
 * The styling is inlined on purpose: at this point the layout that loads the
 * stylesheet has already failed, so Tailwind classes would not apply.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fffbf1",
          color: "#1c1917",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "480px", textAlign: "center" }} role="alert">
          <p style={{ fontSize: "56px", fontWeight: 800, color: "#c7431f", margin: 0, lineHeight: 1 }}>!</p>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: "16px 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "16px", color: "#57534e", margin: "0 0 24px" }}>
            This page could not load. Nothing you did caused it — please try again.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "12px 24px",
                borderRadius: "16px",
                border: 0,
                background: "#1c1917",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A plain anchor is correct here: this boundary replaces the whole
                document, so the client router that <Link> depends on may not be
                mounted. A full navigation is the reliable escape hatch. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                padding: "12px 24px",
                borderRadius: "16px",
                border: "1px solid #e9ddc3",
                background: "#fff",
                color: "#1c1917",
                fontSize: "15px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
          {error.digest ? (
            <p style={{ marginTop: "24px", fontSize: "12px", color: "#a8a29e" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
