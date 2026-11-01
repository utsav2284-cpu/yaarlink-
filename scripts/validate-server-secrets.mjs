// Temporary preview diagnostic: classify Vercel's write-only auth secrets
// with the exact H5 validator. This prints variable names and coarse
// failure reasons only — never secret values, lengths, or entropy.
if (process.env.VERCEL === "1" || process.env.VERCEL_ENV || process.env.SECRET_DIAG === "1") {
  const { collectServerSecretProblems } = await import("../backend/secret-config.ts");
  const problems = collectServerSecretProblems(process.env);
  if (problems.length === 0) {
    console.log("SECRET_DIAG: PASS - production/preview auth secrets satisfy the H5 validator");
  } else {
    console.error(
      `SECRET_DIAG: FAIL - ${problems.map((problem) => `${problem.name} (${problem.reason})`).join(", ")}`,
    );
    process.exit(1);
  }
}
