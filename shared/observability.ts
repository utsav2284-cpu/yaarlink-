/**
 * Small, dependency-free structured logging primitives shared by the Node
 * server and the browser bundle.
 *
 * Security model: logs are an operational side channel, not a place to copy
 * request bodies or database errors verbatim. Values are key-filtered,
 * strings are redacted, object size/depth is bounded, and database errors are
 * projected onto a structural allow-list. In particular, Drizzle's
 * "Failed query" wrapper can embed SQL and bound parameters in its message;
 * that shape is always replaced with a generic database message.
 */

export const REQUEST_ID_HEADER = "x-request-id";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogFields = Record<string, unknown>;

export type SerializedLogError = {
  name: string;
  message: string;
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
  schema?: string;
  routine?: string;
  severity?: string;
  stack?: string;
  cause?: SerializedLogError;
};

export type LogRecord = {
  timestamp: string;
  level: LogLevel;
  event: string;
  service: "yaarlink";
  env: string;
  route?: string;
  requestId?: string;
  component?: string;
  operation?: string;
  error?: SerializedLogError;
  [key: string]: unknown;
};

const MAX_STRING_LENGTH = 1_000;
const MAX_STACK_LENGTH = 4_000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 4;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "authheader",
  "cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "credential",
  "hash",
  "email",
  "phone",
  "contact",
  "ipaddress",
  "useragent",
  "address",
];

const CONTENT_BEARING_KEYS = new Set([
  "body",
  "content",
  "description",
  "details",
  "detail",
  "hint",
  "messagebody",
  "note",
  "notes",
  "query",
  "params",
  "parameters",
  "payload",
]);

function runtimeEnvironment(): string {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.VERCEL_ENV || runtime.process?.env?.NODE_ENV || "unknown";
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  if (normalized === "ip") return true;
  if (CONTENT_BEARING_KEYS.has(normalized)) return true;
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value.trim());
}

export function normalizeRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().split(",", 1)[0]?.trim();
  return isValidRequestId(candidate) ? candidate : undefined;
}

export function createRequestId(): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") return cryptoObject.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

function headerValue(headers: HeaderSource, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) ?? undefined;

  const record = headers as Record<string, string | string[] | undefined>;
  const exact = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  return Array.isArray(exact) ? exact[0] : exact;
}

export function requestIdFromHeaders(headers: HeaderSource, createIfMissing = true): string | undefined {
  const incoming = normalizeRequestId(headerValue(headers, REQUEST_ID_HEADER));
  if (incoming) return incoming;
  const platform = normalizeRequestId(headerValue(headers, "x-vercel-id"));
  if (platform) return platform;
  return createIfMissing ? createRequestId() : undefined;
}

export function normalizeRoutePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const withoutQuery = path.split(/[?#]/, 1)[0]?.trim();
  if (!withoutQuery) return undefined;
  return withoutQuery
    .split("/")
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) return "[id]";
      if (/^\d+$/.test(segment)) return "[id]";
      return segment.slice(0, 80);
    })
    .join("/")
    .slice(0, 240);
}

export function routeFromRequest(request: Request): string {
  try {
    const pathname = normalizeRoutePath(new URL(request.url).pathname) || "/";
    return `${request.method.toUpperCase()} ${pathname}`;
  } catch {
    return `${request.method.toUpperCase()} /unknown`;
  }
}

export function redactString(value: string, maxLength = MAX_STRING_LENGTH): string {
  let output = value.replace(/[\u0000-\u001f\u007f]/g, " ");

  // Credential-bearing URLs and URL query/fragment values.
  output = output.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi, "[REDACTED_URL]");
  output = output.replace(/(\bhttps?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, "$1");

  // Authorization material and common token/hash encodings.
  output = output.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
  output = output.replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, REDACTED);
  output = output.replace(/\bpbkdf2\$[^\s]+/gi, "[REDACTED_PASSWORD_HASH]");
  output = output.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[REDACTED_PASSWORD_HASH]");
  output = output.replace(/\b[0-9a-f]{40,}\b/gi, "[REDACTED_HASH]");

  // Explicit secret assignments in prose/config-like error messages.
  output = output.replace(
    /(\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie)\b\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)/gi,
    `$1${REDACTED}`,
  );

  // Direct identifiers/contact details.
  output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  output = output.replace(/\+?\d[\d\s().-]{7,}\d/g, (candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? "[REDACTED_PHONE]" : candidate;
  });

  return output.length > maxLength ? `${output.slice(0, maxLength)}…` : output;
}

export function sanitizeLogValue(value: unknown, key = "", depth = 0, seen = new WeakSet<object>()): unknown {
  if (key && isSensitiveKey(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return "[Symbol]";
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeLogError(value);
  if (depth >= MAX_DEPTH) return "[Truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeLogValue(item, key, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)) {
      output[childKey] = sanitizeLogValue(childValue, childKey, depth + 1, seen);
    }
    seen.delete(value);
    return output;
  }

  return redactString(String(value));
}

function safeErrorProperty(error: object, key: string, maxLength = 160): string | undefined {
  const value = (error as Record<string, unknown>)[key];
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const clean = redactString(String(value), maxLength).trim();
  return clean || undefined;
}

function rootError(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 10; depth += 1) {
    if (!(current instanceof Error) || seen.has(current)) break;
    seen.add(current);
    const cause = (current as Error & { cause?: unknown }).cause;
    if (!(cause instanceof Error)) break;
    current = cause;
  }
  return current;
}

function hasUnsafeQueryShape(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if ("query" in record || "params" in record || "parameters" in record) return true;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  return /drizzle/i.test(name) || /failed query\s*:/i.test(message) || /\bparams\s*:/i.test(message);
}

export function serializeLogError(error: unknown, depth = 0): SerializedLogError {
  if (typeof error === "string") {
    return { name: "NonError", message: redactString(error) || "Unknown error" };
  }
  if (!(error instanceof Error)) {
    return { name: "NonError", message: `Unknown ${Array.isArray(error) ? "array" : typeof error} error` };
  }

  const root = rootError(error);
  const structuralSource = root instanceof Error ? root : error;
  const queryBearing = hasUnsafeQueryShape(error) || hasUnsafeQueryShape(root);
  const code = safeErrorProperty(structuralSource, "code", 80) || safeErrorProperty(error, "code", 80);
  const serialized: SerializedLogError = {
    name: redactString(error.name || "Error", 120),
    message: queryBearing ? "Database query failed" : redactString(error.message || "Unknown error"),
  };

  const add = (key: keyof SerializedLogError, value: string | undefined) => {
    if (value) serialized[key] = value as never;
  };
  add("code", code);
  add("constraint", safeErrorProperty(structuralSource, "constraint"));
  add("table", safeErrorProperty(structuralSource, "table"));
  add("column", safeErrorProperty(structuralSource, "column"));
  add("schema", safeErrorProperty(structuralSource, "schema"));
  add("routine", safeErrorProperty(structuralSource, "routine"));
  add("severity", safeErrorProperty(structuralSource, "severity", 40));

  if (!queryBearing && error.stack) {
    const stack = redactString(error.stack, MAX_STACK_LENGTH);
    if (!/failed query\s*:|\bparams\s*:/i.test(stack)) serialized.stack = stack;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (depth < 2 && cause !== undefined && cause !== error) {
    serialized.cause = serializeLogError(cause, depth + 1);
    if (queryBearing && serialized.cause) {
      // The root structural fields above are sufficient. Do not retain a
      // query-bearing wrapper's stack or a second copy of its message.
      delete serialized.cause.stack;
      if (hasUnsafeQueryShape(cause)) serialized.cause.message = "Database query failed";
    }
  }

  return serialized;
}

function safeEventName(event: string): string {
  const clean = event.trim().replace(/[^A-Za-z0-9._/-]+/g, "_").slice(0, 120);
  return clean || "log.event";
}

export function createLogRecord(level: LogLevel, event: string, fields: LogFields = {}, error?: unknown): LogRecord {
  const { route, requestId, component, operation, ...rest } = fields;
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    event: safeEventName(event),
    service: "yaarlink",
    env: runtimeEnvironment(),
  };

  const normalizedRoute = typeof route === "string" ? redactString(route, 240) : undefined;
  if (normalizedRoute) record.route = normalizedRoute;
  const normalizedRequestId = normalizeRequestId(requestId);
  if (normalizedRequestId) record.requestId = normalizedRequestId;
  if (typeof component === "string" && component.trim()) record.component = redactString(component, 100);
  if (typeof operation === "string" && operation.trim()) record.operation = redactString(operation, 140);

  for (const [key, value] of Object.entries(rest)) {
    if (key === "error") continue;
    record[key] = sanitizeLogValue(value, key);
  }
  if (error !== undefined) record.error = serializeLogError(error);
  return record;
}

export function writeLog(level: LogLevel, event: string, fields: LogFields = {}, error?: unknown): LogRecord {
  const record = createLogRecord(level, event, fields, error);
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({
      timestamp: record.timestamp,
      level: record.level,
      event: record.event,
      service: record.service,
      env: record.env,
      serializationFailed: true,
    });
  }

  if (level === "error" || level === "fatal") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
  return record;
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): LogRecord {
  return writeLog(level, event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}): LogRecord {
  return writeLog("error", event, fields, error);
}
