"use client";

export class ApiResponseError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code || `http_${status}`);
    this.name = "ApiResponseError";
    this.status = status;
    this.code = code;
  }
}

function codeFromData(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Fetch a JSON object and turn every transport, HTTP, or malformed-payload
 * failure into an ApiResponseError. Callers can therefore render a real
 * error/retry state instead of treating an outage as an empty result.
 */
export async function fetchJsonObject(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiResponseError(0, "network_error");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiResponseError(response.status, codeFromData(data));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiResponseError(502, "load_failed");
  }
  return data as Record<string, unknown>;
}

export async function fetchJsonList<T>(url: string, key: string, init?: RequestInit): Promise<T[]> {
  const data = await fetchJsonObject(url, init);
  const value = data[key];
  if (!Array.isArray(value)) throw new ApiResponseError(502, "load_failed");
  return value as T[];
}

export interface ListPagination {
  limit: number;
  total: number;
  returned: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export function isListPagination(value: unknown): value is ListPagination {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pagination = value as Partial<ListPagination>;
  return (
    Number.isInteger(pagination.limit) &&
    Number.isInteger(pagination.total) &&
    Number.isInteger(pagination.returned) &&
    typeof pagination.hasMore === "boolean" &&
    (pagination.nextCursor === null || typeof pagination.nextCursor === "string")
  );
}

export async function fetchJsonPage<T>(
  url: string,
  key: string,
  init?: RequestInit,
): Promise<{ items: T[]; pagination: ListPagination }> {
  const data = await fetchJsonObject(url, init);
  const value = data[key];
  if (!Array.isArray(value) || !isListPagination(data.pagination)) {
    throw new ApiResponseError(502, "load_failed");
  }
  return { items: value as T[], pagination: data.pagination };
}

export function appendUniqueById<T>(current: T[], next: T[]): T[] {
  const seen = new Set(
    current
      .map((item) => (item && typeof item === "object" && "id" in item ? String((item as { id?: unknown }).id ?? "") : ""))
      .filter(Boolean),
  );
  const merged = [...current];
  for (const item of next) {
    const id = item && typeof item === "object" && "id" in item ? String((item as { id?: unknown }).id ?? "") : "";
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(item);
  }
  return merged;
}
