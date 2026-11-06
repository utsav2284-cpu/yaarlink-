-- Public boolean only: no invitation, email, token, user or profile details.
-- This is presentation state, not authorization to claim the owner seat.
create function public.first_admin_setup_available() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from admin.admin_bootstrap_state s where s.id=true and s.owner_claimed_at is null and s.owner_auth_user_id is null and s.bootstrap_disabled_at is null)
$$;
revoke all on function public.first_admin_setup_available() from public, anon, authenticated, service_role;
grant execute on function public.first_admin_setup_available() to anon, authenticated;
notify pgrst, 'reload schema';
