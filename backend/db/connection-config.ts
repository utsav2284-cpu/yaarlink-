import type { PoolConfig } from "pg";

type DatabaseEnvironment = Record<string, string | undefined>;

const SSL_PARAMETER_NAMES = new Set([
  "ssl",
  "sslmode",
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslrootcert",
  "uselibpqcompat",
]);

/**
 * Explicit pool policy for one warm Node/Vercel instance.
 *
 * The instance may keep at most ten database clients, does not keep a warm
 * minimum alive while idle, and fails connection/query attempts in bounded
 * time instead of letting a dead database turn into indefinitely pending
 * requests. Connections are recycled after 30 minutes so a long-lived warm
 * instance does not retain indefinitely stale sockets.
 */
export const DATABASE_POOL_DEFAULTS = {
  max: 10,
  min: 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 30_000,
  maxLifetimeSeconds: 1_800,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: false,
  application_name: "yaarlink",
} satisfies PoolConfig;

function withPoolDefaults(config: PoolConfig): PoolConfig {
  return { ...DATABASE_POOL_DEFAULTS, ...config };
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1";
}

function isSupabaseHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "supabase.co" || host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com");
}

function normalizedCaCertificate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  // Hosting dashboards sometimes store a pasted PEM with literal \n escapes.
  const certificate = trimmed.includes("\\n") && !trimmed.includes("\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
  if (
    certificate.length > 64_000 ||
    !certificate.includes("-----BEGIN CERTIFICATE-----") ||
    !certificate.includes("-----END CERTIFICATE-----")
  ) {
    throw new Error("DATABASE_CA_CERT must contain a PEM-encoded CA certificate");
  }
  return certificate;
}

function withoutSslParameters(url: URL): string {
  const sanitized = new URL(url.toString());
  for (const key of Array.from(sanitized.searchParams.keys())) {
    if (SSL_PARAMETER_NAMES.has(key.toLowerCase())) sanitized.searchParams.delete(key);
  }
  return sanitized.toString();
}

function configWithCa(url: URL, ca: string): PoolConfig {
  return withPoolDefaults({
    connectionString: withoutSslParameters(url),
    // Passing the CA explicitly makes node-postgres verify both the chain
    // and the hostname. The connection string's sslmode cannot weaken this.
    ssl: { ca, rejectUnauthorized: true },
  });
}

export function getDatabasePoolConfig(env: DatabaseEnvironment = process.env): PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  const ca = normalizedCaCertificate(env.DATABASE_CA_CERT);
  const socketHost = url.searchParams.get("host");
  const isLocal = (!url.hostname && socketHost?.startsWith("/")) || isLoopbackHostname(url.hostname);

  if (isLocal) {
    return ca ? configWithCa(url, ca) : withPoolDefaults({ connectionString });
  }

  const ssl = url.searchParams.get("ssl")?.trim().toLowerCase();
  if (ssl && ["0", "false", "no", "off"].includes(ssl)) {
    throw new Error("DATABASE_URL must enable verified TLS for a remote database");
  }

  const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase();
  if (sslMode === "disable") {
    throw new Error("DATABASE_URL must enable verified TLS for a remote database");
  }

  // An explicit CA is authoritative: strip the URL's SSL-mode parameters and
  // verify the chain/hostname against it. This means a legacy sslmode value
  // such as no-verify can never downgrade the actual connection when the CA
  // has been configured. New connection strings should still say verify-full.
  if (ca) return configWithCa(url, ca);

  if (sslMode !== "verify-full") {
    throw new Error(
      "DATABASE_URL must use sslmode=verify-full for a remote database; do not use no-verify, disable, prefer, require, or verify-ca",
    );
  }

  const sslRootCert = url.searchParams.get("sslrootcert")?.trim();
  if (sslRootCert?.toLowerCase() === "system") {
    throw new Error(
      "DATABASE_URL sslrootcert=system is not supported by node-postgres; omit sslrootcert for a public CA or set DATABASE_CA_CERT",
    );
  }

  if (isSupabaseHostname(url.hostname) && !sslRootCert) {
    throw new Error(
      "DATABASE_URL for Supabase must be paired with DATABASE_CA_CERT (the downloaded Supabase root certificate) or sslrootcert",
    );
  }

  return withPoolDefaults({ connectionString });
}
