import { botChallengeProblem, createBotChallenge, isBotChallengePurpose } from "@/backend/bot-challenge";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const purpose = new URL(req.url).searchParams.get("purpose");
  if (!isBotChallengePurpose(purpose)) {
    return Response.json(
      { error: "Invalid security challenge.", code: "invalid_bot_challenge" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rl = await rateLimit(getClientKey(req, `bot-challenge-${purpose}`), 30, 15 * 60 * 1000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  if (botChallengeProblem()) {
    return Response.json(
      { error: "Service temporarily unavailable.", code: "service_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const challenge = await createBotChallenge(purpose);
  return Response.json(challenge, { headers: { "Cache-Control": "no-store" } });
}
