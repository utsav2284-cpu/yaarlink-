/**
 * Administrator session-cookie attribute policy.
 *
 * Default (every real deployment): `SameSite=Strict`. A Strict cookie is
 * never stored or sent by a browser when the app runs inside a cross-site
 * embedded frame (for example a cloud IDE / preview iframe on another
 * site). In that context a correct password login creates a session the
 * browser then refuses to present, so the user bounces back to sign-in.
 *
 * For LOCAL development against a loopback APP_URL only, an operator may
 * explicitly set `ADMIN_COOKIE_SAME_SITE=none` to switch the cookie to
 * `SameSite=None; Secure; Partitioned` (CHIPS), which is the standards-
 * based way for an embedded cross-site frame to keep its own partitioned
 * first-party cookie. The override is ignored unless APP_URL is loopback,
 * so it can never relax the production policy by accident. CSRF defence
 * does not depend on SameSite alone: every state-changing admin route
 * also enforces same-origin checks.
 */

export type AdminAccountCookieMode = "strict" | "embedded-preview";

export interface AdminAccountCookieEnv {
  ADMIN_COOKIE_SAME_SITE?: string | undefined;
  APP_URL?: string | undefined;
}

export interface AdminAccountCookieAttributes {
  httpOnly: true;
  secure: true;
  sameSite: "strict" | "none";
  partitioned?: boolean;
  path: "/";
  maxAge: number;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackAppUrl(appUrl: string | undefined): boolean {
  if (!appUrl) return false;
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    return LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function resolveAdminAccountCookieMode(env: AdminAccountCookieEnv): AdminAccountCookieMode {
  const requested = (env.ADMIN_COOKIE_SAME_SITE ?? "").trim().toLowerCase();
  if (requested === "none" && isLoopbackAppUrl(env.APP_URL)) return "embedded-preview";
  return "strict";
}

export function adminAccountCookieAttributes(
  mode: AdminAccountCookieMode,
  maxAgeSeconds: number,
): AdminAccountCookieAttributes {
  if (mode === "embedded-preview") {
    return {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
      path: "/",
      maxAge: maxAgeSeconds,
    };
  }
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
