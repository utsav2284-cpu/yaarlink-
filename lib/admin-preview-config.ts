// This admin client is restricted to the dedicated Preview project. Never
// silently use the shared application URL when it points elsewhere.
export const ADMIN_PREVIEW_SUPABASE_URL = "https://qwngmsedyepghskoagaj.supabase.co";

export function requirePreviewSupabaseUrl(configured: string | undefined): string {
  if (configured !== undefined && configured !== "" && configured !== ADMIN_PREVIEW_SUPABASE_URL && configured !== `${ADMIN_PREVIEW_SUPABASE_URL}/`) {
    throw new Error("Admin Preview is not configured for the dedicated Preview project.");
  }
  return ADMIN_PREVIEW_SUPABASE_URL;
}
