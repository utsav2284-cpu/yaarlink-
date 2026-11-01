import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { parseUuid } from "@/backend/validation";

export const MAX_LIST_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;

export type CursorValue = string | number | null;
export type SortDirection = "asc" | "desc";
export type SortValueKind = "string" | "number" | "date" | "uuid";

export interface SortKey<Row> {
  /** A non-null SQL expression. Nullable columns must be wrapped in coalesce. */
  expression: SQLWrapper;
  direction: SortDirection;
  kind: SortValueKind;
  /** Extract the same logical value represented by `expression` from a DB row. */
  value: (row: Row) => CursorValue | Date | undefined;
}

export interface PaginationMeta {
  limit: number;
  total: number;
  returned: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ParsedListingParams {
  limit: number;
  cursor: string | null;
  q: string;
  sort: string;
}

interface CursorPayload {
  v: 1;
  sort: string;
  scope: string;
  values: CursorValue[];
}

export class ListingQueryError extends Error {
  readonly status = 400;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ListingQueryError";
  }
}

export function isListingQueryError(error: unknown): error is ListingQueryError {
  return error instanceof ListingQueryError;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function paramValue(params: URLSearchParams, prefix: string, name: string, aliases: string[] = []): string | null {
  const names = [name, ...aliases].map((candidate) => (prefix ? `${prefix}${capitalize(candidate)}` : candidate));
  for (const candidate of names) {
    const value = params.get(candidate);
    if (value != null) return value;
  }
  return null;
}

export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function parseListingParams(
  params: URLSearchParams,
  options: {
    defaultLimit?: number;
    maxLimit?: number;
    prefix?: string;
    defaultSort: string;
    allowedSorts: readonly string[];
  },
): ParsedListingParams {
  const prefix = options.prefix ?? "";
  const maxLimit = Math.min(options.maxLimit ?? MAX_LIST_LIMIT, MAX_LIST_LIMIT);
  const defaultLimit = Math.min(Math.max(options.defaultLimit ?? 25, 1), maxLimit);

  const rawLimit = paramValue(params, prefix, "limit", ["pageSize"]);
  let limit = defaultLimit;
  if (rawLimit != null && rawLimit.trim() !== "") {
    if (!/^\d+$/.test(rawLimit.trim())) {
      throw new ListingQueryError("invalid_pagination", "Please provide a valid page size.");
    }
    const parsed = Number(rawLimit);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new ListingQueryError("invalid_pagination", "Please provide a valid page size.");
    }
    limit = Math.min(parsed, maxLimit);
  }

  const rawQ = paramValue(params, prefix, "q", ["search", "query"]) ?? "";
  if (rawQ.length > MAX_SEARCH_LENGTH) {
    throw new ListingQueryError("invalid_search", "Please shorten your search and try again.");
  }
  const q = rawQ.trim().replace(/\s+/g, " ");

  const rawSort = paramValue(params, prefix, "sort");
  const sort = rawSort?.trim() || options.defaultSort;
  if (!options.allowedSorts.includes(sort)) {
    throw new ListingQueryError("invalid_sort", "Please choose a valid sort order.");
  }

  const rawCursor = paramValue(params, prefix, "cursor");
  const cursor = rawCursor?.trim() || null;
  if (cursor && cursor.length > 4096) {
    throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  }

  return { limit, cursor, q, sort };
}

export function parseEnumParam(
  params: URLSearchParams,
  name: string,
  allowed: readonly string[],
  options: { prefix?: string; aliases?: string[] } = {},
): string | null {
  const raw = paramValue(params, options.prefix ?? "", name, options.aliases);
  if (raw == null || raw.trim() === "") return null;
  const value = raw.trim();
  if (!allowed.includes(value)) {
    throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
  }
  return value;
}

export function parseNormalizedParam<T extends string>(
  params: URLSearchParams,
  name: string,
  normalize: (value: unknown) => T | null,
  options: { prefix?: string; aliases?: string[] } = {},
): T | null {
  const raw = paramValue(params, options.prefix ?? "", name, options.aliases);
  if (raw == null || raw.trim() === "") return null;
  const value = normalize(raw.trim());
  if (!value) throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
  return value;
}

export function parseUuidParam(
  params: URLSearchParams,
  name: string,
  options: { prefix?: string; aliases?: string[] } = {},
): string | null {
  const raw = paramValue(params, options.prefix ?? "", name, options.aliases);
  if (raw == null || raw.trim() === "") return null;
  const value = parseUuid(raw);
  if (!value) throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
  return value;
}

export function parseUuidListParam(
  params: URLSearchParams,
  name: string,
  options: { prefix?: string; maxItems?: number } = {},
): string[] | null {
  const raw = paramValue(params, options.prefix ?? "", name);
  if (raw == null || raw.trim() === "") return null;
  const values = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
  const maxItems = options.maxItems ?? MAX_LIST_LIMIT;
  if (values.length === 0 || values.length > maxItems || values.some((value) => !isUuidValue(value))) {
    throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
  }
  return values;
}

export function scopeFrom(parts: Record<string, unknown>): string {
  return JSON.stringify(parts);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizeCursorValue(value: CursorValue | Date | undefined): CursorValue {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return value;
}

export function encodeCursor(sort: string, scope: string, values: Array<CursorValue | Date | undefined>): string {
  const payload: CursorPayload = {
    v: 1,
    sort,
    scope,
    values: values.map(normalizeCursorValue),
  };
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function convertCursorValue(value: CursorValue, kind: SortValueKind): string | number | Date {
  if (value == null) throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  if (kind === "date") {
    if (typeof value !== "string") throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
    return date;
  }
  if (kind === "number") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
    return number;
  }
  if (typeof value !== "string") throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  if (kind === "uuid" && !isUuidValue(value)) {
    throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  }
  return value;
}

export function decodeCursor<Row>(
  raw: string | null,
  options: { sort: string; scope: string; keys: Array<SortKey<Row>> },
): Array<string | number | Date> | null {
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw))) as unknown;
  } catch {
    throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  }
  const candidate = payload as Partial<CursorPayload>;
  if (
    candidate.v !== 1 ||
    candidate.sort !== options.sort ||
    candidate.scope !== options.scope ||
    !Array.isArray(candidate.values) ||
    candidate.values.length !== options.keys.length
  ) {
    throw new ListingQueryError("invalid_cursor", "This page link is no longer valid. Please start again.");
  }
  return candidate.values.map((value, index) => convertCursorValue(value, options.keys[index].kind));
}

export function sortOrder<Row>(keys: Array<SortKey<Row>>): SQL[] {
  return keys.map((key) => (key.direction === "asc" ? sql`${key.expression} asc` : sql`${key.expression} desc`));
}

export function cursorCondition<Row>(
  keys: Array<SortKey<Row>>,
  values: Array<string | number | Date> | null,
): SQL | undefined {
  if (!values) return undefined;
  const branches: SQL[] = [];
  keys.forEach((key, index) => {
    const parts: SQL[] = [];
    for (let previous = 0; previous < index; previous += 1) {
      parts.push(sql`${keys[previous].expression} = ${values[previous]}`);
    }
    parts.push(
      key.direction === "asc"
        ? sql`${key.expression} > ${values[index]}`
        : sql`${key.expression} < ${values[index]}`,
    );
    branches.push(sql`(${sql.join(parts, sql` and `)})`);
  });
  return sql`(${sql.join(branches, sql` or `)})`;
}

export function paginateRows<Row>(
  rowsWithExtra: Row[],
  options: {
    limit: number;
    total: number;
    sort: string;
    scope: string;
    keys: Array<SortKey<Row>>;
  },
): { items: Row[]; pagination: PaginationMeta } {
  const hasMore = rowsWithExtra.length > options.limit;
  const items = hasMore ? rowsWithExtra.slice(0, options.limit) : rowsWithExtra;
  const last = items[items.length - 1];
  return {
    items,
    pagination: {
      limit: options.limit,
      total: Math.max(0, Math.trunc(options.total || 0)),
      returned: items.length,
      hasMore,
      nextCursor:
        hasMore && last ? encodeCursor(options.sort, options.scope, options.keys.map((key) => key.value(last))) : null,
    },
  };
}

export function allConditions(conditions: Array<SQL | SQLWrapper | undefined | null | false>): SQL | undefined {
  const active = conditions.filter(Boolean) as SQL[];
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return sql`(${sql.join(active.map((condition) => sql`${condition}`), sql` and `)})`;
}

function likePattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * Case-insensitive token search. Every whitespace-separated token must match
 * at least one supplied text expression; user wildcards are escaped.
 */
export function searchCondition(expressions: SQLWrapper[], q: string): SQL | undefined {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || expressions.length === 0) return undefined;
  const tokenConditions = tokens.map((token) => {
    const pattern = likePattern(token);
    return sql`(${sql.join(
      expressions.map((expression) => sql`${expression} ilike ${pattern} escape '\\'`),
      sql` or `,
    )})`;
  });
  return sql`(${sql.join(tokenConditions, sql` and `)})`;
}

export function textExpression(expression: SQLWrapper): SQL {
  return sql`coalesce(${expression}::text, '')`;
}

/** Match one canonical token inside a canonical comma-separated text column. */
export function tokenListCondition(expression: SQLWrapper, value: string): SQL {
  return sql`concat(',', replace(coalesce(${expression}::text, ''), ', ', ','), ',') like concat('%,', ${value}::text, ',%')`;
}
