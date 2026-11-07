// The browser may contact only the admin Auth project for this deployment.
export function adminAuthCspOrigin(vercelEnvironment: string | undefined): string {
  return vercelEnvironment === "production"
    ? "https://dqhxgwzjwzvpqiilteld.supabase.co"
    : "https://qwngmsedyepghskoagaj.supabase.co";
}
