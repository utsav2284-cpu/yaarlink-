export async function register() {
  // `next build` should not need production secrets merely to compile. The
  // check runs when a server instance starts and request-level guards remain
  // as a fail-closed backstop on platforms that do not invoke instrumentation.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertServerSecretConfiguration } = await import("@/backend/secret-config");
  try {
    assertServerSecretConfiguration();
  } catch (error) {
    console.error(error);
    // Next records an instrumentation failure but can leave a Node HTTP
    // listener alive returning 500s. Exit explicitly in the Node runtime so
    // supervisors and deployment health checks see a failed startup. Edge
    // runtimes still fail initialization by rethrowing.
    if (process.env.NEXT_RUNTIME === "nodejs") process.exit(1);
    throw error;
  }
}
