import type { NextConfig } from "next";
import { assertPublicEnvironmentNamesSafe } from "./backend/public-env";

// Fail the build before bundling if deployment configuration puts a secret-like
// or unreviewed value under NEXT_PUBLIC_*. The check inspects names only.
assertPublicEnvironmentNamesSafe();

// API responses are data, not documents. If a browser navigates directly to
// one, this deny-all policy prevents it from becoming an active document.
const API_CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";

const STATIC_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Make the deployment classification available to browser code even when
  // Vercel does not expose its NEXT_PUBLIC_ system metadata automatically.
  // This value is only a target selector, never a security credential.
  env: { NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "development" },
  // Arena's authenticated Preview proxy uses an e2b.app hostname; this affects
  // Next development resources only and does not configure Auth redirects.
  allowedDevOrigins: ["*.e2b.app"],
  // Document CSP is generated per request in proxy.ts because it contains a
  // nonce. The headers below do not vary by request, so they stay static.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: STATIC_SECURITY_HEADERS,
      },
      {
        source: "/api/(.*)",
        headers: [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }],
      },
    ];
  },
};

export default nextConfig;
