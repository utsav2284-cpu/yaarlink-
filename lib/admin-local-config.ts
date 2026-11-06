// Deliberately restricted to a developer's own browser and development server.
// Never use the local endpoint from a hosted, proxied or production page.
export function isLocalAdminTarget(flag: string | undefined, nodeEnv: string | undefined, deployment: string | undefined, origin: string | undefined): boolean {
  if (flag !== "true") return false;
  if (nodeEnv !== "development" || (deployment !== undefined && deployment !== "" && deployment !== "development")) throw new Error("Local admin authentication is restricted to development.");
  if (origin !== "http://127.0.0.1:3000") throw new Error("Local admin authentication requires the exact local browser origin.");
  return true;
}

export function localAdminCspAllowed(flag: string | undefined, nodeEnv: string | undefined, vercel: string | undefined, host: string | undefined, forwardedHost: string | null): boolean {
  return flag === "true" && nodeEnv === "development" && !vercel && host === "127.0.0.1:3000" && !forwardedHost;
}
