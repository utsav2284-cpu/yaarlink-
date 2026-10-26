import type { NextConfig } from "next";

const CSP_REPORT_ONLY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const nextConfig: NextConfig = {
  // Single authoritative source for security headers. Start CSP in report-only until the
  // report stream is clean, then switch the key to "Content-Security-Policy".
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
  // `pg` loads `pg-cloudflare` only when running on Cloudflare Workers. Next's file tracer
  // can't see that dynamic require, so include the real files for the Cloudflare build.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/esm/**", "./node_modules/pg-cloudflare/package.json"],
  },
};

export default nextConfig;
