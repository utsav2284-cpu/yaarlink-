import { AsyncLocalStorage } from "node:async_hooks";
import {
  normalizeRequestId,
  normalizeRoutePath,
  REQUEST_ID_HEADER,
  requestIdFromHeaders,
  routeFromRequest,
  writeLog,
  type LogFields,
  type LogLevel,
  type LogRecord,
} from "@/shared/observability";

export {
  createLogRecord,
  createRequestId,
  isValidRequestId,
  normalizeRequestId,
  normalizeRoutePath,
  REQUEST_ID_HEADER,
  requestIdFromHeaders,
  routeFromRequest,
  sanitizeLogValue,
  serializeLogError,
} from "@/shared/observability";
export type { LogFields, LogLevel, LogRecord, SerializedLogError } from "@/shared/observability";

export type RequestLogContext = {
  requestId: string;
  route: string;
};

type HeaderRecord = Record<string, string | string[] | undefined>;
export type RequestLogSource = Request | Headers | HeaderRecord | undefined | null;

const globalForObservability = globalThis as typeof globalThis & {
  __yaarlinkRequestLogStorage?: AsyncLocalStorage<RequestLogContext>;
};

function getStorage(): AsyncLocalStorage<RequestLogContext> {
  globalForObservability.__yaarlinkRequestLogStorage ??= new AsyncLocalStorage<RequestLogContext>();
  return globalForObservability.__yaarlinkRequestLogStorage;
}

function headersFromSource(source: RequestLogSource): Headers | HeaderRecord | undefined {
  if (!source) return undefined;
  if (typeof Request !== "undefined" && source instanceof Request) return source.headers;
  return source as Headers | HeaderRecord;
}

function routeFromHeaders(headers: Headers | HeaderRecord | undefined, explicitRoute?: string): string {
  if (explicitRoute) return explicitRoute;
  if (!headers) return "unknown";
  const pathname =
    typeof Headers !== "undefined" && headers instanceof Headers
      ? headers.get("x-yaarlink-pathname")
      : (headers as HeaderRecord)["x-yaarlink-pathname"];
  const value = Array.isArray(pathname) ? pathname[0] : pathname;
  return normalizeRoutePath(typeof value === "string" ? value : undefined) || "unknown";
}

export function requestLogContext(source: RequestLogSource, explicitRoute?: string): RequestLogContext {
  const existing = getStorage().getStore();
  if (!source && existing) {
    return explicitRoute ? { ...existing, route: explicitRoute } : existing;
  }

  const headers = headersFromSource(source);
  const requestId = requestIdFromHeaders(headers) || existing?.requestId || "unknown";
  const route =
    explicitRoute ||
    (typeof Request !== "undefined" && source instanceof Request
      ? routeFromRequest(source)
      : routeFromHeaders(headers, existing?.route));

  return { requestId, route };
}

export function enterRequestLogContext(source: RequestLogSource, explicitRoute?: string): RequestLogContext {
  const context = requestLogContext(source, explicitRoute);
  getStorage().enterWith(context);
  return context;
}

export function getRequestLogContext(): RequestLogContext | undefined {
  return getStorage().getStore();
}

function withAmbientContext(fields: LogFields): LogFields {
  const context = getStorage().getStore();
  if (!context) return fields;
  return {
    ...context,
    ...fields,
    requestId: normalizeRequestId(fields.requestId) || context.requestId,
    route: typeof fields.route === "string" && fields.route ? fields.route : context.route,
  };
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): LogRecord {
  return writeLog(level, event, withAmbientContext(fields));
}

export function logError(event: string, error: unknown, fields: LogFields = {}): LogRecord {
  return writeLog("error", event, withAmbientContext(fields), error);
}

export function logRouteEvent(
  level: LogLevel,
  event: string,
  source: RequestLogSource,
  fields: LogFields = {},
  explicitRoute?: string,
): LogRecord {
  const context = enterRequestLogContext(source, explicitRoute);
  return logEvent(level, event, { ...context, ...fields });
}

export function logRouteError(
  source: RequestLogSource,
  error: unknown,
  fields: LogFields = {},
  explicitRoute?: string,
): LogRecord {
  const context = enterRequestLogContext(source, explicitRoute);
  return logError("request.failed", error, { ...context, ...fields });
}

export function requestIdHeaderValue(source: RequestLogSource): string {
  return requestLogContext(source).requestId;
}

export function setRequestIdHeader(headers: Headers, requestId: string): void {
  headers.set(REQUEST_ID_HEADER, requestId);
}
