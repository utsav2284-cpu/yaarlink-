// Operator preflight only. This module cannot create invitations or accounts.
// The request and its target are fixed; no token, SQL parameter or response is logged.
export const MANAGEMENT_QUERY_URL = 'https://api.supabase.com/v1/projects/dqhxgwzjwzvpqiilteld/database/query';
export const PREFLIGHT_QUERY = `begin;
do $$
declare s record;
begin
  if current_user <> 'postgres' or current_database() <> 'postgres' or
     not coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false)
  then raise exception 'operator_identity_or_tls_failed'; end if;
  select owner_claimed_at, owner_auth_user_id into s
    from admin.admin_bootstrap_state where id=true for update;
  if not found or s.owner_claimed_at is not null or s.owner_auth_user_id is not null
  then raise exception 'bootstrap_unavailable'; end if;
  if exists(select 1 from admin.admin_invitations where invitation_kind='bootstrap' and status='pending')
  then raise exception 'pending_invitation_exists'; end if;
end $$;
rollback;
select 'production_management_preflight_pass' as result;`;

export async function managementPreflight(token, { send = fetch, tlsDisabled = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' } = {}) {
  if (tlsDisabled || typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new Error('Trusted management configuration required');
  const response = await send(MANAGEMENT_QUERY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PREFLIGHT_QUERY }),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Management preflight unavailable or denied');
  const data = await response.json();
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.result !== 'production_management_preflight_pass') {
    throw new Error('Management preflight did not return a confirmed result');
  }
  return { status: 'pass', changes: false };
}
