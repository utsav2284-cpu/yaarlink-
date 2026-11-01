import { eq } from "drizzle-orm";
import { hashPassword, sessionSecretProblem, setSessionCookie, verifyLoginPassword } from "@/backend/auth";
import { db } from "@/backend/db";
import { users } from "@/backend/db/schema";
import { normalizeEmail, readJsonObject } from "@/backend/validation";
import {
  authLockoutSeconds,
  clearAuthFailures,
  getClientKey,
  hashKey,
  limitedResponse,
  rateLimit,
  registerAuthFailure,
} from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function wrongCredentialsResponse() {
  return Response.json(
    { error: "Wrong email or password.", code: "wrong_credentials" },
    { status: 401, headers: NO_STORE },
  );
}

function serviceUnavailableResponse() {
  return Response.json(
    { error: "Login is temporarily unavailable.", code: "service_unavailable" },
    { status: 503, headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  try {
    const clientKey = getClientKey(req, "login");
    const rl = await rateLimit(clientKey, 10, 5 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    const email = normalizeEmail(body.email) ?? "";
    const password = body.password;
    if (!email || typeof password !== "string" || !password) {
      return Response.json(
        { error: "Email and password required", code: "invalid_request" },
        { status: 400, headers: NO_STORE },
      );
    }

    // Startup validation should prevent this, but keep the request path
    // fail-closed if a platform does not run instrumentation. Do this before
    // account lookup/session signing so bad configuration is a clear 503,
    // not a generic failure discovered only when a token is signed.
    if (sessionSecretProblem()) return serviceUnavailableResponse();

    // Failure lockouts are keyed by the submitted, normalized email whether
    // or not an account exists for it. The IP key is tracked separately.
    const accountKey = `login-account:${await hashKey(email)}`;
    const lockedFor = Math.max(await authLockoutSeconds(clientKey), await authLockoutSeconds(accountKey));
    if (lockedFor > 0) return limitedResponse(lockedFor);

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];

    // Unknown emails run the same PBKDF2-shaped dummy verification as a real
    // wrong-password attempt, so account existence is not exposed by skipping
    // password work.
    const verification = await verifyLoginPassword(password, user?.passwordHash);
    if (!user || !verification.ok) {
      await registerAuthFailure(accountKey);
      await registerAuthFailure(clientKey);
      return wrongCredentialsResponse();
    }

    await clearAuthFailures(accountKey);
    await clearAuthFailures(clientKey);

    if (verification.needsRehash) {
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
    }

    await setSessionCookie(user.id, user.tokenVersion, req);
    return Response.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error(error);
    return serviceUnavailableResponse();
  }
}
