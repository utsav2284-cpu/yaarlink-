import { createHash } from "node:crypto";

export const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 1_000;
export const MIN_SLOW_QUERY_THRESHOLD_MS = 50;
export const MAX_SLOW_QUERY_THRESHOLD_MS = 60_000;

export function slowQueryThresholdMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.SLOW_QUERY_THRESHOLD_MS?.trim();
  if (!raw) return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  return Math.min(MAX_SLOW_QUERY_THRESHOLD_MS, Math.max(MIN_SLOW_QUERY_THRESHOLD_MS, Math.round(parsed)));
}

function queryText(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const text = (input as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

export function normalizeSqlForFingerprint(input: unknown): string {
  return queryText(input)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/"(?:""|[^"])*"/g, (quoted) => quoted.toLowerCase())
    .replace(/\$\d+/g, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 8_000);
}

function operationAfterCtes(normalized: string): string | undefined {
  let index = "with".length;

  const skipWhitespace = () => {
    while (normalized[index] === " ") index += 1;
  };

  skipWhitespace();
  if (normalized.startsWith("recursive ", index)) {
    index += "recursive ".length;
  }

  while (index < normalized.length) {
    const asMatch = /\bas\b/.exec(normalized.slice(index));
    if (!asMatch) return undefined;
    index += asMatch.index + asMatch[0].length;
    skipWhitespace();

    if (normalized.startsWith("materialized ", index)) {
      index += "materialized ".length;
    } else if (normalized.startsWith("not materialized ", index)) {
      index += "not materialized ".length;
    }

    if (normalized[index] !== "(") return undefined;

    let depth = 0;
    let closed = false;
    for (; index < normalized.length; index += 1) {
      if (normalized[index] === "(") depth += 1;
      if (normalized[index] === ")") depth -= 1;
      if (depth === 0) {
        index += 1;
        closed = true;
        break;
      }
    }
    if (!closed) return undefined;

    skipWhitespace();
    if (normalized[index] !== ",") break;
    index += 1;
  }

  skipWhitespace();
  return normalized.slice(index).match(/^[a-z]+/)?.[0];
}

export function sqlOperation(input: unknown): string {
  const normalized = normalizeSqlForFingerprint(input);
  const first = normalized.match(/^[a-z]+/)?.[0];
  if (first && first !== "with") return first;
  if (first === "with") return operationAfterCtes(normalized) || "with";
  return "unknown";
}

export function sqlFingerprint(input: unknown): string {
  const normalized = normalizeSqlForFingerprint(input);
  return createHash("sha256").update(normalized || "unknown", "utf8").digest("hex").slice(0, 16);
}

export function shouldLogSlowQuery(durationMs: number, thresholdMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs >= thresholdMs;
}
