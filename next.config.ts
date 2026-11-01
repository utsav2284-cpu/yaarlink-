import type { NextConfig } from "next";

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
