import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;
const MAX_REPORTS = 10;
const MAX_URL_LENGTH = 512;
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/csp-report",
  "application/json",
  "application/reports+json",
  "text/plain",
]);

type JsonRecord = Record<string, unknown>;

type SanitizedCspReport = {
  documentUrl?: string;
  effectiveDirective?: string;
  blockedUrl?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  disposition?: string;
  statusCode?: number;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringField(record: JsonRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberField(record: JsonRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isInteger(number) && number >= 0 && number <= 1_000_000) return number;
  }
  return undefined;
}

function sanitizeUrl(value: string | undefined, requestUrl: string): string | undefined {
  if (!value) return undefined;

  const keyword = value.trim().toLowerCase();
  if (["inline", "eval", "data", "blob", "filesystem"].includes(keyword)) return keyword;
  if (keyword.startsWith("data:")) return "data:";
  if (keyword.startsWith("blob:")) return "blob:";

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const url = new URL(value, requestUrl);

    // Query strings and fragments can contain verification/reset tokens.
    const sanitized = url.origin === requestOrigin ? url.pathname : `${url.origin}${url.pathname}`;
    return sanitized.slice(0, MAX_URL_LENGTH);
  } catch {
    return undefined;
  }
}

function sanitizeDirective(value: string | undefined): string | undefined {
  const firstToken = value?.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return firstToken && /^[a-z][a-z0-9-]*$/.test(firstToken) ? firstToken : undefined;
}

function sanitizeReport(record: JsonRecord, requestUrl: string): SanitizedCspReport {
  const disposition = stringField(record, ["disposition"])?.toLowerCase();

  // Deliberately omit original-policy (it contains the live nonce), script
  // samples, referrers, user agents, and every URL query/fragment. What
  // remains is enough to identify the blocked resource and responsible page.
  return {
    documentUrl: sanitizeUrl(stringField(record, ["documentURL", "document-uri", "documentUrl"]), requestUrl),
    effectiveDirective: sanitizeDirective(
      stringField(record, ["effectiveDirective", "effective-directive", "violatedDirective", "violated-directive"]),
    ),
    blockedUrl: sanitizeUrl(stringField(record, ["blockedURL", "blocked-uri", "blockedUrl"]), requestUrl),
    sourceFile: sanitizeUrl(stringField(record, ["sourceFile", "source-file"]), requestUrl),
    lineNumber: numberField(record, ["lineNumber", "line-number"]),
    columnNumber: numberField(record, ["columnNumber", "column-number"]),
    disposition: disposition === "enforce" || disposition === "report" ? disposition : undefined,
    statusCode: numberField(record, ["statusCode", "status-code"]),
  };
}

function reportBodies(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.slice(0, MAX_REPORTS).flatMap((entry) => {
      const wrapper = asRecord(entry);
      if (!wrapper) return [];
      if (wrapper.type !== undefined && wrapper.type !== "csp-violation") return [];
      const body = asRecord(wrapper.body);
      return body ? [body] : [];
    });
  }

  const record = asRecord(payload);
  if (!record) return [];

  const legacyReport = asRecord(record["csp-report"]);
  if (legacyReport) return [legacyReport];

  return [record];
}

async function readBodyWithLimit(req: Request): Promise<string | null> {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return body + decoder.decode();
}

function errorResponse(code: string, status: number) {
  return Response.json({ error: code, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "csp-report"), 60, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && !ACCEPTED_CONTENT_TYPES.has(contentType)) {
    return errorResponse("unsupported_media_type", 415);
  }

  const rawBody = await readBodyWithLimit(req);
  if (rawBody === null) return errorResponse("payload_too_large", 413);
  if (!rawBody.trim()) return errorResponse("invalid_report", 400);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("invalid_report", 400);
  }

  const reports = reportBodies(payload)
    .map((report) => sanitizeReport(report, req.url))
    .filter((report) => report.effectiveDirective || report.blockedUrl || report.documentUrl);
  if (!reports.length) return errorResponse("invalid_report", 400);

  for (const report of reports) {
    console.warn("[csp-report]", report);
  }

  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
