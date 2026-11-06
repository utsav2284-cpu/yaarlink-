-- Preview only. This establishes a fail-closed recovery boundary, not a bypass.
create table admin.admin_recovery_controls (
 auth_user_id uuid primary key references admin.admin_profiles(auth_user_id) on delete restrict,
 recovery_pending boolean not null default false,
 requested_at timestamptz,
 constraint recovery_pending_has_time check (not recovery_pending or requested_at is not null)
);
alter table admin.admin_recovery_controls enable row level security;
revoke all on admin.admin_recovery_controls from public, anon, authenticated, service_role;
create table admin.admin_recovery_attempts (
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references admin.admin_profiles(auth_user_id) on delete restrict,
 attempted_at timestamptz not null default now()
);
create index admin_recovery_attempts_user_time on admin.admin_recovery_attempts(auth_user_id,attempted_at);
alter table admin.admin_recovery_attempts enable row level security;
revoke all on admin.admin_recovery_attempts from public, anon, authenticated, service_role;
alter table admin.admin_recovery_codes add column expires_at timestamptz;
-- A pending recovery must block both permission checks and session registration,
-- including for already-issued AAL2 access tokens. Existing identities without
-- a recovery row remain unchanged. No application role can clear this state.
create or replace function admin.is_active_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from admin.admin_profiles p where p.auth_user_id=auth.uid() and p.status='active')
 and not exists (select 1 from admin.admin_recovery_controls r where r.auth_user_id=auth.uid() and r.recovery_pending)
$$;
revoke execute on function admin.is_active_admin() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
