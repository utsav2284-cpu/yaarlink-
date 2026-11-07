import { requirePreviewSupabaseUrl } from "./admin-preview-config.ts";

const PRODUCTION_URL = "https://dqhxgwzjwzvpqiilteld.supabase.co";

/** Only the actual Production deployment can select Production admin Auth.
 * A missing, ambiguous, or unexpected Production URL fails closed. Preview
 * deployments remain pinned to the separate Preview project.
 */
export function requireAdminSupabaseTarget(deployment: string | undefined, configured: string | undefined): { url: string; production: boolean } {
  if (deployment === "production") {
    if (configured !== PRODUCTION_URL && configured !== `${PRODUCTION_URL}/`) {
      throw new Error("Production admin authentication is not configured for the Production project.");
    }
    return { url: PRODUCTION_URL, production: true };
  }
  if (deployment !== undefined && deployment !== "" && deployment !== "preview" && deployment !== "development") {
    throw new Error("Admin deployment environment is not recognized.");
  }
  return { url: requirePreviewSupabaseUrl(configured), production: false };
}
