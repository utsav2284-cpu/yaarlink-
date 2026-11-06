// Trusted operator only: fixed project, recipient and production callback.
export const PRODUCTION_URL = 'https://dqhxgwzjwzvpqiilteld.supabase.co';
export const OWNER_EMAIL = 'utsavkumar20518@gmail.com';
export const PRODUCTION_CALLBACK = 'https://www.theyaar.com/admin/auth/callback';

export function validateProductionAuthInviteConfig(config, callback) {
  const allowed = typeof config?.uri_allow_list === 'string'
    ? config.uri_allow_list.split(',').map(x => x.trim()).filter(Boolean) : [];
  if (callback !== PRODUCTION_CALLBACK || config?.site_url !== 'https://www.theyaar.com' ||
      !allowed.includes(PRODUCTION_CALLBACK) || allowed.some(x => /[*?]/.test(x))) {
    throw new Error('Production callback configuration is not verified');
  }
  if (!config.smtp_host || !config.smtp_port || !config.smtp_user || !config.smtp_admin_email ||
      config.disable_signup !== true || config.external_email_enabled !== true) {
    throw new Error('Production Auth configuration is unsafe or incomplete');
  }
}

export function validateProductionServiceKey(key) {
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid Production service key'); }
  // Project/role guard only; Supabase verifies the signature when the key is used.
  if (claims?.ref !== 'dqhxgwzjwzvpqiilteld' || claims?.role !== 'service_role') throw new Error('Invalid Production service key');
}

export async function sendProductionAuthInvite(auth, callback) {
  if (callback !== PRODUCTION_CALLBACK) throw new Error('Invalid callback');
  const result = await auth.admin.inviteUserByEmail(OWNER_EMAIL, {redirectTo: callback});
  if (result.error || !result.data?.user?.id) throw new Error('Auth invitation request failed or is uncertain');
  return {status: 'accepted_by_auth'}; // Not evidence of email delivery.
}
