export const ADMIN_WEBAUTHN_RP_NAME = "YaarLink Admin";
export const ADMIN_WEBAUTHN_TIMEOUT_MS = 60_000;
export const ADMIN_WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60_000;

const KNOWN_PASSKEY_TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export type AdminWebAuthnRpConfig = {
  rpID: string;
  expectedOrigins: string[];
};

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function looksLikeIpAddress(hostname: string): boolean {
  return /^[0-9.]+$/u.test(hostname) || hostname.includes(":");
}

function validHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253 || hostname.startsWith(".") || hostname.endsWith(".")) return false;
  return hostname
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
}

/**
 * Resolve the WebAuthn relying-party values from the exact browser Origin.
 *
 * Production intentionally collapses the apex and www hosts to the registrable
 * `theyaar.com` RP ID so one Passkey works on both. Preview/staging deploys use
 * their exact hostname, keeping their credentials cryptographically separate
 * from production. Plain HTTP is accepted only for loopback development.
 */
export function resolveAdminWebAuthnConfig(originValue: string | null | undefined): AdminWebAuthnRpConfig | null {
  if (!originValue) return null;

  let url: URL;
  try {
    url = new URL(originValue);
  } catch {
    return null;
  }

  // An Origin header has no path, query, fragment, or credentials.
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const loopback = isLoopbackHostname(hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return null;
  if (!loopback && (looksLikeIpAddress(hostname) || !validHostname(hostname))) return null;

  if (hostname === "theyaar.com" || hostname.endsWith(".theyaar.com")) {
    return {
      rpID: "theyaar.com",
      expectedOrigins: ["https://theyaar.com", "https://www.theyaar.com"],
    };
  }

  return { rpID: hostname, expectedOrigins: [url.origin] };
}

/** Convert the stable administrator UUID to the opaque 16-byte WebAuthn user handle. */
export function adminPasskeyUserHandle(adminUserId: string): Uint8Array | null {
  if (!UUID_PATTERN.test(adminUserId)) return null;
  const hex = adminUserId.replace(/-/gu, "");
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function normalizePasskeyDeviceName(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL_CHARACTER_PATTERN.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > 120) return null;
  return normalized;
}

export function sanitizePasskeyTransports(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const transports: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const transport = candidate.trim().toLowerCase();
    if (!KNOWN_PASSKEY_TRANSPORTS.has(transport) || transports.includes(transport)) continue;
    transports.push(transport);
    if (transports.length >= 8) break;
  }
  return transports;
}

/**
 * Accept an increasing signature counter. Some platform/synced authenticators
 * always report zero; zero-to-zero is therefore valid, while any non-zero
 * regression/replay fails closed as a possible cloned authenticator.
 */
export function isPasskeyCounterAcceptable(storedCounter: number, newCounter: number): boolean {
  if (!Number.isSafeInteger(storedCounter) || !Number.isSafeInteger(newCounter)) return false;
  if (storedCounter < 0 || newCounter < 0 || newCounter > 0xffffffff) return false;
  return newCounter > storedCounter || (storedCounter === 0 && newCounter === 0);
}

export type AdminPasskeyRegistrationResponse = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData?: string;
    transports?: string[];
    publicKeyAlgorithm?: number;
    publicKey?: string;
  };
  authenticatorAttachment?: "cross-platform" | "platform";
  clientExtensionResults: Record<string, never>;
  type: "public-key";
};

export type AdminPasskeyAuthenticationResponse = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  authenticatorAttachment?: "cross-platform" | "platform";
  clientExtensionResults: Record<string, never>;
  type: "public-key";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function base64UrlString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : null;
}

function authenticatorAttachment(value: unknown): "cross-platform" | "platform" | undefined | null {
  if (value === undefined) return undefined;
  return value === "cross-platform" || value === "platform" ? value : null;
}

function parseCredentialEnvelope(value: unknown): {
  id: string;
  rawId: string;
  response: Record<string, unknown>;
  authenticatorAttachment?: "cross-platform" | "platform";
} | null {
  if (!isRecord(value) || value.type !== "public-key" || !isRecord(value.response)) return null;
  if (value.clientExtensionResults !== undefined && !isRecord(value.clientExtensionResults)) return null;
  const id = base64UrlString(value.id, 512);
  const rawId = base64UrlString(value.rawId, 512);
  const attachment = authenticatorAttachment(value.authenticatorAttachment);
  if (!id || !rawId || id !== rawId || attachment === null) return null;
  return {
    id,
    rawId,
    response: value.response,
    ...(attachment ? { authenticatorAttachment: attachment } : {}),
  };
}

export function parseAdminPasskeyRegistrationResponse(
  value: unknown,
): AdminPasskeyRegistrationResponse | null {
  const envelope = parseCredentialEnvelope(value);
  if (!envelope) return null;

  const clientDataJSON = base64UrlString(envelope.response.clientDataJSON, 8192);
  const attestationObject = base64UrlString(envelope.response.attestationObject, 32768);
  if (!clientDataJSON || !attestationObject) return null;

  const response: AdminPasskeyRegistrationResponse["response"] = { clientDataJSON, attestationObject };
  if (envelope.response.authenticatorData !== undefined) {
    const authenticatorData = base64UrlString(envelope.response.authenticatorData, 8192);
    if (!authenticatorData) return null;
    response.authenticatorData = authenticatorData;
  }
  if (envelope.response.transports !== undefined) {
    if (!Array.isArray(envelope.response.transports) || envelope.response.transports.length > 8) return null;
    response.transports = sanitizePasskeyTransports(envelope.response.transports);
  }
  if (envelope.response.publicKeyAlgorithm !== undefined) {
    const algorithm = envelope.response.publicKeyAlgorithm;
    if (typeof algorithm !== "number" || !Number.isSafeInteger(algorithm) || algorithm < -65535 || algorithm > 65535) return null;
    response.publicKeyAlgorithm = algorithm;
  }
  if (envelope.response.publicKey !== undefined) {
    const publicKey = base64UrlString(envelope.response.publicKey, 8192);
    if (!publicKey) return null;
    response.publicKey = publicKey;
  }

  return {
    id: envelope.id,
    rawId: envelope.rawId,
    response,
    ...(envelope.authenticatorAttachment
      ? { authenticatorAttachment: envelope.authenticatorAttachment }
      : {}),
    clientExtensionResults: {},
    type: "public-key",
  };
}

export function parseAdminPasskeyAuthenticationResponse(
  value: unknown,
): AdminPasskeyAuthenticationResponse | null {
  const envelope = parseCredentialEnvelope(value);
  if (!envelope) return null;

  const clientDataJSON = base64UrlString(envelope.response.clientDataJSON, 8192);
  const authenticatorData = base64UrlString(envelope.response.authenticatorData, 8192);
  const signature = base64UrlString(envelope.response.signature, 8192);
  if (!clientDataJSON || !authenticatorData || !signature) return null;

  const response: AdminPasskeyAuthenticationResponse["response"] = {
    clientDataJSON,
    authenticatorData,
    signature,
  };
  if (envelope.response.userHandle !== undefined) {
    const userHandle = base64UrlString(envelope.response.userHandle, 512);
    if (!userHandle) return null;
    response.userHandle = userHandle;
  }

  return {
    id: envelope.id,
    rawId: envelope.rawId,
    response,
    ...(envelope.authenticatorAttachment
      ? { authenticatorAttachment: envelope.authenticatorAttachment }
      : {}),
    clientExtensionResults: {},
    type: "public-key",
  };
}
