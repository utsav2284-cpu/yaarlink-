// Trusted operator-only helpers. No browser usage and no secret logging.
export const PREVIEW_URL='https://qwngmsedyepghskoagaj.supabase.co';
export const OWNER_EMAIL='utsavkumar20518@gmail.com';
export function validateAuthInviteConfig(config, callback) {
  let url;
  try { url = new URL(callback); } catch { throw new Error('Callback not verified'); }
  const allowed = typeof config?.uri_allow_list === 'string' ? config.uri_allow_list.split(',').map(x=>x.trim()) : [];
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/admin/auth/callback' || url.href !== callback ||
      config.site_url !== url.origin || !allowed.includes(callback)) throw new Error('Callback not verified');
  if (!config.smtp_host || !config.smtp_port || !config.smtp_user || !config.smtp_admin_email) throw new Error('Custom SMTP is not configured');
  if (config.disable_signup !== true || config.external_email_enabled !== true) throw new Error('Preview Auth configuration is unsafe');
}
export async function sendAuthInvite(auth, callback) {
  const result=await auth.admin.inviteUserByEmail(OWNER_EMAIL, {redirectTo:callback});
  if (result.error || !result.data?.user?.id) throw new Error('Auth invitation request failed or is uncertain');
  // API acceptance is not email delivery or owner acceptance.
  return {status:'accepted_by_auth'};
}
