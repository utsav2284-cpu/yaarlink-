import { createServer } from "node:http";
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  throw new Error("local-dev-services must never run in production or on Vercel.");
}

const HOST = "127.0.0.1";
const parsedPort = Number(process.env.LOCAL_DEV_SERVICES_PORT ?? "4025");
const PORT = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535 ? parsedPort : 4025;
const OUTBOX = resolve(process.env.LOCAL_EMAIL_OUTBOX ?? ".local/email-outbox.jsonl");
const MAX_BODY_BYTES = 1_000_000;

await mkdir(dirname(OUTBOX), { recursive: true, mode: 0o700 });
await appendFile(OUTBOX, "", { mode: 0o600 });
await chmod(OUTBOX, 0o600).catch(() => {});

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "yaarlink-local-dev-services" });
      return;
    }

    // Minimal Have I Been Pwned range shape for offline development only.
    // Count 0 is padding, not a breach result. The request contains only a
    // five-character hash prefix, and this stub intentionally does not log it.
    if (request.method === "GET" && /^\/range\/[0-9a-f]{5}$/i.test(url.pathname)) {
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end("00000000000000000000000000000000000:0\n");
      return;
    }

    // Resend-compatible enough for backend/email.ts: accept POST /emails,
    // persist only the text part to an ignored local outbox so verification
    // and reset links can be opened during offline end-to-end testing.
    if (request.method === "POST" && url.pathname === "/emails") {
      const rawBody = await readBody(request);
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        sendJson(response, 400, { error: "invalid_json" });
        return;
      }
      const record = {
        receivedAt: new Date().toISOString(),
        to: Array.isArray(payload?.to) ? payload.to : [],
        subject: typeof payload?.subject === "string" ? payload.subject : "",
        text: typeof payload?.text === "string" ? payload.text : "",
      };
      await appendFile(OUTBOX, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      sendJson(response, 201, { id: `local-${randomUUID()}` });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      sendJson(response, 413, { error: "request_too_large" });
      return;
    }
    sendJson(response, 500, { error: "local_service_error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`YaarLink local dev services: http://${HOST}:${PORT}`);
  console.log(`Local email outbox: ${OUTBOX}`);
  console.log("Local only: this service stores test email links and must never be deployed.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
