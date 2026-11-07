-- CANDIDATE ONLY, NOT A MIGRATION. Do not install or enable on hosted Auth.
-- Depends on preview_direct_google_owner.sql. This deliberately closes *all*
-- new signup other than the one provisioned initial Google account. Existing
-- future invite/signup paths need a separately reviewed extension before use.
-- The hook does not authorize ownership; the claim independently validates the
-- Google identity, confirmed email, secret authorization, password and MFA.
create function public.hook_direct_owner_signup(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_email text := lower(coalesce(event->'user'->>'email',''));
  v_provider text := coalesce(event->'user'->'app_metadata'->>'provider','');
begin
  if v_provider = 'google' and v_email <> ''
    and exists (select 1 from admin.admin_bootstrap_state s
      where s.id=true and s.owner_claimed_at is null
        and s.owner_auth_user_id is null and s.bootstrap_disabled_at is null)
    and exists (select 1 from admin.first_owner_setup_authorizations a
      where a.id=true and a.email=v_email and a.consumed_at is null and a.expires_at>now())
  then return '{}'::jsonb; end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Signup is not available.'));
end $$;
revoke all on function public.hook_direct_owner_signup(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hook_direct_owner_signup(jsonb) to supabase_auth_admin;
-- Activation is deliberately omitted. Provider metadata trust, exact hook
-- payloads, concurrent signup, expiry, and behavior with signup disabled must
-- be proven against genuine local Supabase Auth before any hosted proposal.
