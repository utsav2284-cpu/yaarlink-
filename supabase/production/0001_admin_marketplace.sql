-- CANDIDATE: not deployed. Apply only after isolated replay and production preflight.
-- Fail instead of modifying any pre-existing admin/audit schema or setup RPC.
do $$ begin
 if exists(select 1 from pg_namespace where nspname in ('admin','audit')) then raise exception 'admin_schema_already_exists'; end if;
 if to_regclass('public.creators') is null or to_regclass('public.campaigns') is null or to_regclass('public.applications') is null then raise exception 'marketplace_not_connected'; end if;
 if to_regprocedure('public.first_admin_setup_available()') is not null then raise exception 'setup_rpc_already_exists'; end if;
end $$;
create schema admin;
create schema audit;
revoke all on schema admin, audit from public, anon, authenticated, service_role;
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Fail-closed helper stubs (Step 1 of design §13). Real bodies replace these in Migration 2.
create or replace function admin.current_admin_id() returns uuid language plpgsql stable security definer set search_path='' as $$ begin return null; end $$;
create or replace function admin.is_active_admin() returns boolean language plpgsql stable security definer set search_path='' as $$ begin return false; end $$;
create or replace function admin.has_aal2() returns boolean language plpgsql stable security definer set search_path='' as $$ begin return false; end $$;
create or replace function admin.session_is_current() returns boolean language plpgsql stable security definer set search_path='' as $$ begin return false; end $$;
create or replace function admin.has_verified_totp_factor() returns boolean language plpgsql stable security definer set search_path='' as $$ begin return false; end $$;
create or replace function admin.has_permission(p_key text) returns boolean language plpgsql stable security definer set search_path='' as $$ begin return false; end $$;
create or replace function admin.has_step_up(p_action text, p_resource text) returns boolean language plpgsql stable security definer set search_path='' as $$ begin return false; end $$;
revoke execute on function admin.current_admin_id(), admin.is_active_admin(), admin.has_aal2(), admin.session_is_current(), admin.has_verified_totp_factor(), admin.has_permission(text), admin.has_step_up(text,text) from public, anon;
grant execute on function admin.current_admin_id(), admin.is_active_admin(), admin.has_aal2(), admin.session_is_current(), admin.has_verified_totp_factor(), admin.has_permission(text), admin.has_step_up(text,text) to authenticated;

create table admin.admin_roles (
  key text primary key,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table admin.admin_permissions (
  key text primary key,
  description text,
  module text not null,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);
create table admin.admin_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 120),
  email_snapshot citext not null unique,
  status text not null default 'invited' check (status in ('invited','active','suspended','deactivated')),
  is_owner boolean not null default false,
  invited_by uuid references admin.admin_profiles(auth_user_id) on delete restrict,
  invitation_id uuid,
  invitation_kind text not null default 'admin_invite' check (invitation_kind in ('admin_invite','bootstrap')),
  last_login_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((invitation_kind='bootstrap' and invited_by is null) or (invitation_kind='admin_invite'))
);
create unique index admin_profiles_single_owner on admin.admin_profiles (is_owner) where is_owner;
create unique index admin_profiles_invitation_unique on admin.admin_profiles (invitation_id) where invitation_id is not null;
create index admin_profiles_status on admin.admin_profiles (status);

create table admin.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  invited_by uuid references admin.admin_profiles(auth_user_id) on delete restrict,
  invitation_kind text not null default 'admin_invite' check (invitation_kind in ('admin_invite','bootstrap')),
  operator_authorization_ref text,
  intended_role_key text references admin.admin_roles(key) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked','superseded')),
  token_hash bytea,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_auth_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((invitation_kind='bootstrap' and invited_by is null) or (invitation_kind='admin_invite' and invited_by is not null) or (invitation_kind='bootstrap')),
  check (expires_at > created_at)
);
alter table admin.admin_profiles add constraint admin_profiles_invitation_fk
  foreign key (invitation_id) references admin.admin_invitations(id) on delete restrict;
create unique index admin_invitations_one_pending on admin.admin_invitations (email) where status='pending';
create unique index admin_invitations_one_accepted_user on admin.admin_invitations (accepted_auth_user_id) where accepted_auth_user_id is not null;
create index admin_invitations_status on admin.admin_invitations (status, expires_at);

create table admin.admin_bootstrap_state (
  id boolean primary key check (id = true),
  owner_claimed_at timestamptz,
  owner_auth_user_id uuid references auth.users(id) on delete restrict,
  bootstrap_disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into admin.admin_bootstrap_state (id) values (true);

create table admin.role_permissions (
  role_key text not null references admin.admin_roles(key) on delete restrict,
  permission_key text not null references admin.admin_permissions(key) on delete restrict,
  granted_by uuid references admin.admin_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);
create table admin.admin_role_assignments (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references admin.admin_profiles(auth_user_id) on delete restrict,
  role_key text not null references admin.admin_roles(key) on delete restrict,
  granted_by uuid references admin.admin_profiles(auth_user_id) on delete restrict,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  is_current boolean not null default true,
  revoked_at timestamptz,
  revoked_by uuid references admin.admin_profiles(auth_user_id) on delete restrict,
  revoke_reason text check (revoke_reason in ('revoked','expired','superseded','suspended') or revoke_reason is null),
  reason text,
  check ((is_current and revoked_at is null and revoke_reason is null) or (not is_current and revoked_at is not null and revoke_reason is not null)),
  check (expires_at is null or expires_at > granted_at)
);
create unique index admin_role_assignments_current on admin.admin_role_assignments (auth_user_id, role_key) where is_current;
create index admin_role_assignments_user on admin.admin_role_assignments (auth_user_id);

create table admin.identity_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type in ('invitation_accept','bootstrap_claim','admin_suspend','admin_deactivate','recovery_complete')),
  idempotency_key text not null unique,
  invitation_id uuid references admin.admin_invitations(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete restrict,
  actor_auth_user_id uuid references admin.admin_profiles(auth_user_id) on delete restrict,
  state text not null default 'pending' check (state in ('pending','auth_done','db_done','completed','failed','retryable','compensated')),
  attempts int not null default 0,
  last_error_code text,
  payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index identity_operations_state on admin.identity_operations (state, updated_at);

-- RLS: enable, revoke, then policies referencing the (currently fail-closed) helpers.
alter table admin.admin_roles enable row level security;
alter table admin.admin_permissions enable row level security;
alter table admin.admin_profiles enable row level security;
alter table admin.admin_invitations enable row level security;
alter table admin.admin_bootstrap_state enable row level security;
alter table admin.role_permissions enable row level security;
alter table admin.admin_role_assignments enable row level security;
alter table admin.identity_operations enable row level security;
revoke all on admin.admin_roles, admin.admin_permissions, admin.admin_profiles, admin.admin_invitations, admin.admin_bootstrap_state, admin.role_permissions, admin.admin_role_assignments, admin.identity_operations from anon, authenticated;
grant select (auth_user_id, display_name, status, is_owner, created_at, last_login_at) on admin.admin_profiles to authenticated;
grant select (auth_user_id, role_key, granted_at, expires_at, is_current) on admin.admin_role_assignments to authenticated;

create policy profiles_own_select on admin.admin_profiles for select to authenticated
  using (auth.uid() = auth_user_id);
create policy profiles_directory_select on admin.admin_profiles for select to authenticated
  using (admin.has_permission('admins.read'));
create policy roles_read on admin.admin_roles for select to authenticated using (admin.has_permission('roles.read'));
create policy permissions_read on admin.admin_permissions for select to authenticated using (admin.has_permission('roles.read'));
create policy role_permissions_read on admin.role_permissions for select to authenticated using (admin.has_permission('roles.read'));
create policy assignments_own_select on admin.admin_role_assignments for select to authenticated
  using (auth.uid() = auth_user_id);
create policy assignments_read on admin.admin_role_assignments for select to authenticated
  using (admin.has_permission('roles.read'));
create policy invitations_manage on admin.admin_invitations for select to authenticated
  using (admin.has_permission('admins.invite'));
-- identity_operations and admin_bootstrap_state: no client policies (deny-all for client roles).

-- Permission catalogue: 30 assignable + owner.bootstrap (non-assignable)
insert into admin.admin_permissions (key, module, description, is_sensitive) values
 ('dashboard.view','dashboard','View dashboard',false),
 ('admins.read','admins','Read administrators',false),
 ('admins.invite','admins','Invite administrators',true),
 ('admins.manage','admins','Suspend/deactivate administrators',true),
 ('roles.read','roles','Read roles',false),
 ('roles.manage','roles','Manage roles',true),
 ('audit.read','audit','Read audit log',false),
 ('security.read','security','Read security data',false),
 ('security.manage','security','Manage security/alerts/revoke sessions',true),
 ('creators.read','creators','Read creators',false),
 ('creators.manage','creators','Manage creators',false),
 ('campaigns.read','campaigns','Read campaigns',false),
 ('campaigns.manage','campaigns','Manage campaigns',false),
 ('brands.read','brands','Read brands',false),
 ('brands.manage','brands','Manage brands',false),
 ('users.read','users','Read users',false),
 ('users.manage','users','Manage users',false),
 ('moderation.read','moderation','Read reports',false),
 ('moderation.act','moderation','Act on reports',false),
 ('site_config.read','site_config','Read site configuration',false),
 ('site_config.manage','site_config','Manage site configuration',true),
 ('analytics.read','analytics','Read analytics',false),
 ('notifications.manage','notifications','Manage notifications',false),
 ('crm.read','crm','Read CRM',false),
 ('crm.manage','crm','Manage CRM',false),
 ('privacy.read','privacy','Read privacy requests',false),
 ('privacy.manage','privacy','Manage privacy requests',true),
 ('backups.read','backups','Read backup records',false),
 ('backups.manage','backups','Manage backup records',true),
 ('settings.manage','settings','Manage settings',true),
 ('owner.bootstrap','owner','First-owner bootstrap (function-internal only)',true);
insert into admin.admin_roles (key, name, description) values
 ('super_admin','Super Admin','Full administrative authority'),
 ('admin','Admin','Operational administrator'),
 ('moderator','Moderator','Moderation-focused administrator'),
 ('support','Support','Support/read-focused administrator'),
 ('auditor','Auditor','Read-only auditor');
insert into admin.role_permissions (role_key, permission_key)
select 'super_admin', key from admin.admin_permissions where key <> 'owner.bootstrap';
insert into admin.role_permissions (role_key, permission_key) values
 ('admin','dashboard.view'),('admin','admins.read'),('admin','roles.read'),('admin','audit.read'),('admin','security.read'),
 ('admin','creators.read'),('admin','creators.manage'),('admin','campaigns.read'),('admin','campaigns.manage'),
 ('admin','brands.read'),('admin','brands.manage'),('admin','users.read'),('admin','users.manage'),
 ('admin','moderation.read'),('admin','moderation.act'),('admin','site_config.read'),('admin','analytics.read'),
 ('admin','notifications.manage'),('admin','crm.read'),('admin','crm.manage'),('admin','privacy.read'),
 ('admin','backups.read'),
 ('moderator','dashboard.view'),('moderator','creators.read'),('moderator','campaigns.read'),('moderator','brands.read'),
 ('moderator','users.read'),('moderator','moderation.read'),('moderator','moderation.act'),('moderator','analytics.read'),
 ('support','dashboard.view'),('support','creators.read'),('support','campaigns.read'),('support','brands.read'),
 ('support','users.read'),('support','moderation.read'),('support','site_config.read'),('support','analytics.read'),
 ('support','notifications.manage'),('support','crm.read'),('support','privacy.read'),
 ('auditor','dashboard.view'),('auditor','admins.read'),('auditor','roles.read'),('auditor','audit.read'),
 ('auditor','security.read'),('auditor','creators.read'),('auditor','campaigns.read'),('auditor','brands.read'),
 ('auditor','users.read'),('auditor','moderation.read'),('auditor','site_config.read'),('auditor','analytics.read'),
 ('auditor','crm.read'),('auditor','privacy.read'),('auditor','backups.read');
-- Only identity, session, audit and marketplace-review dependencies are installed.
alter table admin.identity_operations drop constraint identity_operations_actor_auth_user_id_fkey;
alter table admin.identity_operations add constraint identity_operations_actor_auth_user_id_fkey foreign key(actor_auth_user_id) references auth.users(id) on delete restrict;
create table admin.admin_mfa_status (auth_user_id uuid primary key references admin.admin_profiles(auth_user_id) on delete restrict, totp_verified_factor_count int not null default 0, has_verified_totp boolean not null default false, last_factor_verified_at timestamptz, last_synced_at timestamptz not null default now(), enrollment_required boolean not null default true);
create table admin.admin_session_registry (session_id uuid primary key, auth_user_id uuid not null references admin.admin_profiles(auth_user_id) on delete restrict, aal_at_issue text, ip inet, user_agent text, created_at timestamptz not null default now(), last_seen_at timestamptz, revoked_at timestamptz, revoked_by uuid references admin.admin_profiles(auth_user_id) on delete restrict, revoke_reason text);
create index session_registry_user on admin.admin_session_registry (auth_user_id, revoked_at);
create table audit.audit_log (id bigint generated always as identity primary key, prev_hash bytea not null, row_hash bytea not null unique, occurred_at timestamptz not null default now(), actor_auth_user_id uuid, actor_profile_id uuid references admin.admin_profiles(auth_user_id) on delete set null, actor_role_snapshot text[], action text not null, resource_type text not null, resource_id text, outcome text not null check (outcome in ('success','denied','failed')), aal_at_action text, ip inet, user_agent text, request_id uuid, before_state jsonb, after_state jsonb, reason text, metadata jsonb not null default '{}'::jsonb);
create table audit.audit_chain_head (id boolean primary key check (id=true), last_id bigint not null default 0, last_row_hash bytea not null default decode(repeat('00',32),'hex'), updated_at timestamptz not null default now());
insert into audit.audit_chain_head (id) values (true);
alter table admin.admin_mfa_status enable row level security;
alter table admin.admin_session_registry enable row level security;
alter table audit.audit_log enable row level security;
alter table audit.audit_chain_head enable row level security;
revoke all on admin.admin_mfa_status, admin.admin_session_registry, audit.audit_log, audit.audit_chain_head from public, anon, authenticated, service_role;
create function audit._enc(p_value bytea) returns bytea language sql immutable as $$ select case when p_value is null then decode('ffffffffffffffff','hex') else int8send(coalesce(octet_length(p_value),0)::bigint) || coalesce(p_value,''::bytea) end $$;
-- Canonical JSON for the narrowly scoped audit payloads: reject non-ASCII
-- keys, non-integral or unsafe numeric values rather than hash ambiguously.
create function audit._canonical(p_value jsonb) returns text language plpgsql immutable strict set search_path='' as $$
declare t text; v text; n numeric;
begin
 t:=jsonb_typeof(p_value);
 if t='object' then
  if exists(select 1 from jsonb_object_keys(p_value) as k where k ~ '[^ -~]') then raise exception 'audit_invalid_json_key'; end if;
  select '{'||coalesce(string_agg(to_json(k)::text||':'||audit._canonical(val),',' order by k collate "C"),'')||'}' into v from jsonb_each(p_value) as e(k,val); return v;
 elsif t='array' then
  select '['||coalesce(string_agg(audit._canonical(val),',' order by ord),'')||']' into v from jsonb_array_elements(p_value) with ordinality as a(val,ord); return v;
 elsif t='number' then
  n:=(p_value::text)::numeric;
  if n <> trunc(n) or abs(n)>9007199254740991 then raise exception 'audit_invalid_json_number'; end if;
  return n::bigint::text;
 elsif t in ('string','boolean','null') then return p_value::text;
 end if;
 raise exception 'audit_invalid_json';
end $$;
create function audit._roles(p_roles text[]) returns bytea language sql immutable strict set search_path='' as $$
 select int4send(count(*)::integer) || coalesce(string_agg(audit._enc(role::bytea),''::bytea order by role collate "C"),''::bytea)
 from (select distinct unnest(p_roles) as role) roles
$$;
create function audit.hash_fields(p_prev bytea,p_id bigint,p_time timestamptz,p_actor uuid,p_profile uuid,p_roles text[],p_action text,p_type text,p_id_text text,p_outcome text,p_aal text,p_ip inet,p_agent text,p_request uuid,p_before jsonb,p_after jsonb,p_reason text,p_metadata jsonb) returns bytea language sql immutable set search_path='' as $$
 select extensions.digest(decode('796161726c696e6b2d61756469742d763100','hex') || p_prev || audit._enc(p_id::text::bytea) || audit._enc(to_char(p_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')::bytea) || audit._enc(p_actor::text::bytea) || audit._enc(p_profile::text::bytea) || audit._enc(audit._roles(p_roles)) || audit._enc(p_action::bytea) || audit._enc(p_type::bytea) || audit._enc(p_id_text::bytea) || audit._enc(p_outcome::bytea) || audit._enc(p_aal::bytea) || audit._enc(host(p_ip)::bytea) || audit._enc(p_agent::bytea) || audit._enc(p_request::text::bytea) || audit._enc(audit._canonical(p_before)::bytea) || audit._enc(audit._canonical(p_after)::bytea) || audit._enc(p_reason::bytea) || audit._enc(audit._canonical(p_metadata)::bytea), 'sha256')
$$;
create function audit.append_audit(p_actor uuid, p_action text, p_resource_type text, p_resource_id text, p_outcome text, p_after jsonb default null, p_before jsonb default null, p_reason text default null, p_metadata jsonb default '{}'::jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare v_prev bytea; v_id bigint; v_hash bytea; v_roles text[]; v_now timestamptz := clock_timestamp(); v_aal text := nullif(auth.jwt()->>'aal','');
begin
 perform pg_advisory_xact_lock(727001);
 select last_row_hash into v_prev from audit.audit_chain_head where id=true for update;
 select array_agg(role_key order by role_key) into v_roles from admin.admin_role_assignments where auth_user_id=p_actor and is_current and (expires_at is null or expires_at>now());
 insert into audit.audit_log(prev_hash,row_hash,occurred_at,actor_auth_user_id,actor_profile_id,actor_role_snapshot,action,resource_type,resource_id,outcome,aal_at_action,after_state,before_state,reason,metadata) values (v_prev,decode(repeat('00',32),'hex'),v_now,p_actor,p_actor,coalesce(v_roles,array[]::text[]),p_action,p_resource_type,p_resource_id,p_outcome,v_aal,p_after,p_before,p_reason,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 v_hash := audit.hash_fields(v_prev,v_id,v_now,p_actor,p_actor,coalesce(v_roles,array[]::text[]),p_action,p_resource_type,p_resource_id,p_outcome,v_aal,null,null,null,p_before,p_after,p_reason,coalesce(p_metadata,'{}'::jsonb));
 update audit.audit_log set row_hash=v_hash where id=v_id;
 update audit.audit_chain_head set last_id=v_id,last_row_hash=v_hash,updated_at=now() where id=true;
 return v_id;
end $$;
revoke all on function audit.append_audit(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create or replace function admin.is_active_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists (select 1 from admin.admin_profiles p where p.auth_user_id=auth.uid() and p.status='active') $$;
create or replace function admin.has_aal2() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(auth.jwt()->>'aal','aal1')='aal2' $$;
create or replace function admin.session_is_current() returns boolean language sql stable security definer set search_path='' as $$ select exists (select 1 from admin.admin_session_registry s where s.session_id=(auth.jwt()->>'session_id')::uuid and s.auth_user_id=auth.uid() and s.revoked_at is null) $$;
create or replace function admin.has_verified_totp_factor() returns boolean language sql stable security definer set search_path='' as $$ select exists (select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.factor_type='totp' and f.status='verified') $$;
create or replace function admin.has_permission(p_key text) returns boolean language sql stable security definer set search_path='' as $$ select admin.is_active_admin() and admin.has_aal2() and admin.session_is_current() and admin.has_verified_totp_factor() and exists (select 1 from admin.admin_role_assignments a join admin.role_permissions rp on rp.role_key=a.role_key where a.auth_user_id=auth.uid() and a.is_current and (a.expires_at is null or a.expires_at>now()) and rp.permission_key=p_key) $$;
insert into admin.admin_permissions(key,module,description) values ('creators.review','creators','Review creators'),('creators.approve','creators','Approve creators'),('campaigns.review','campaigns','Review campaigns'),('campaigns.publish','campaigns','Publish campaigns');
insert into admin.role_permissions(role_key,permission_key) select 'super_admin', key from admin.admin_permissions where key in ('creators.review','creators.approve','campaigns.review','campaigns.publish');

-- Preview: register a newly authenticated admin session without undoing revocation.
create or replace function admin.register_my_session() returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_session uuid; v_inserted integer;
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if not (admin.is_active_admin() and admin.has_aal2() and admin.has_verified_totp_factor()) then raise exception 'permission_denied'; end if;
 begin v_session := (auth.jwt()->>'session_id')::uuid; exception when invalid_text_representation then raise exception 'invalid_session'; end;
 if v_session is null then raise exception 'invalid_session'; end if;
 insert into admin.admin_session_registry(session_id,auth_user_id,aal_at_issue) values (v_session,v_uid,'aal2') on conflict (session_id) do nothing;
 get diagnostics v_inserted = row_count;
 if not exists (select 1 from admin.admin_session_registry where session_id=v_session and auth_user_id=v_uid and revoked_at is null) then raise exception 'session_revoked_or_mismatch'; end if;
 if v_inserted=1 then perform audit.append_audit(v_uid,'session.registered','admin_session',v_session::text,'success','{}'::jsonb); end if;
end $$;
revoke execute on function admin.register_my_session() from public, anon, service_role;
grant execute on function admin.register_my_session() to authenticated;
notify pgrst, 'reload schema';


-- Preview only. Only the token-bound wrapper may call the existing claim function.
create or replace function admin.claim_first_owner(p_display_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_inv admin.admin_invitations; v_now timestamptz := now(); v_session uuid;
 v_totp_time bigint;
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if char_length(trim(coalesce(p_display_name,''))) not between 1 and 100 then raise exception 'invalid_display_name'; end if;
 if not exists (select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null and lower(u.email)=v_email and v_email<>'') then raise exception 'verified_email_required'; end if;
 if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception 'aal2_required'; end if;
 if not exists (select 1 from auth.mfa_factors f where f.user_id=v_uid and f.factor_type='totp' and f.status='verified') then raise exception 'verified_totp_required'; end if;
 select max((x->>'timestamp')::bigint) into v_totp_time from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end) x where x->>'method'='totp' and (x->>'timestamp') ~ '^[0-9]{1,12}$';
 if v_totp_time is null or v_totp_time < extract(epoch from v_now - interval '10 minutes') or v_totp_time > extract(epoch from v_now + interval '30 seconds') then raise exception 'fresh_totp_required'; end if;
 begin v_session := (auth.jwt()->>'session_id')::uuid; exception when invalid_text_representation then raise exception 'invalid_session'; end;
 if v_session is null then raise exception 'invalid_session'; end if;
 perform 1 from admin.admin_bootstrap_state where id=true for update;
 if exists (select 1 from admin.admin_bootstrap_state where id=true and owner_claimed_at is not null) then raise exception 'bootstrap_locked'; end if;
 select * into v_inv from admin.admin_invitations where invitation_kind='bootstrap' and invited_by is null and intended_role_key='super_admin' and nullif(trim(operator_authorization_ref),'') is not null and status='pending' and accepted_auth_user_id is null and expires_at>v_now and expires_at<=created_at+interval '72 hours' and octet_length(token_hash)=32 and lower(email::text)=v_email order by created_at limit 1 for update;
 if not found then raise exception 'bootstrap_invitation_not_found'; end if;
 insert into admin.identity_operations(operation_type,idempotency_key,invitation_id,auth_user_id,actor_auth_user_id,state,payload_summary) values ('bootstrap_claim','bootstrap:'||v_inv.id, v_inv.id, v_uid, v_uid, 'db_done', jsonb_build_object('invitation_validated_at',v_now,'auth_identity_validated_at',v_now,'mfa_validated_at',v_now)) on conflict (idempotency_key) do update set state='db_done', attempts=admin.identity_operations.attempts+1, updated_at=v_now;
 update admin.admin_invitations set status='accepted', accepted_at=v_now, accepted_auth_user_id=v_uid, updated_at=v_now where id=v_inv.id and status='pending';
 if not found then raise exception 'invitation_consumed'; end if;
 insert into admin.admin_profiles(auth_user_id,display_name,email_snapshot,status,is_owner,invitation_id,invitation_kind) values (v_uid, trim(p_display_name), v_email, 'invited', true, v_inv.id, 'bootstrap');
 insert into admin.admin_role_assignments(auth_user_id,role_key) values (v_uid,'super_admin');
 update admin.admin_bootstrap_state set owner_claimed_at=v_now, owner_auth_user_id=v_uid, bootstrap_disabled_at=v_now, updated_at=v_now where id=true and owner_claimed_at is null;
 if not found then raise exception 'bootstrap_race_lost'; end if;
 update admin.admin_profiles set status='active', updated_at=v_now where auth_user_id=v_uid;
 insert into admin.admin_session_registry(session_id,auth_user_id,aal_at_issue) values (v_session, v_uid, 'aal2');
 insert into admin.admin_mfa_status(auth_user_id,totp_verified_factor_count,has_verified_totp,last_factor_verified_at,last_synced_at,enrollment_required) values (v_uid,1,true,v_now,v_now,false) on conflict (auth_user_id) do update set totp_verified_factor_count=1,has_verified_totp=true,last_synced_at=v_now,enrollment_required=false;
 update admin.identity_operations set state='completed', completed_at=v_now, updated_at=v_now where idempotency_key='bootstrap:'||v_inv.id;
 perform audit.append_audit(v_uid,'owner.claimed','admin_bootstrap_state','true','success',jsonb_build_object('owner',v_uid));
 return v_uid;
end $$;
revoke execute on function admin.claim_first_owner(text) from public, anon, authenticated, service_role;

-- The operator delivers 32 random bytes as exactly 64 hexadecimal characters;
-- token_hash stores SHA-256 of the decoded bytes, never the token itself.
create or replace function admin.claim_invited_first_owner(p_display_name text,p_invitation_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_email text := lower(coalesce(auth.jwt()->>'email','')); v_hash bytea;
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if coalesce(p_invitation_token,'') !~ '^[0-9a-fA-F]{64}$' then raise exception 'invalid_invitation'; end if;
 if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception 'aal2_required'; end if;
 if not exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null and lower(u.email)=v_email and v_email<>'') then raise exception 'verified_email_required'; end if;
 v_hash := extensions.digest(decode(p_invitation_token,'hex'),'sha256');
 perform 1 from admin.admin_bootstrap_state where id=true for update;
 if exists(select 1 from admin.admin_bootstrap_state where id=true and owner_claimed_at is not null) then raise exception 'bootstrap_locked'; end if;
 perform 1 from admin.admin_invitations where invitation_kind='bootstrap' and invited_by is null and intended_role_key='super_admin' and nullif(trim(operator_authorization_ref),'') is not null and status='pending' and accepted_auth_user_id is null and expires_at>now() and expires_at<=created_at+interval '72 hours' and lower(email::text)=v_email and token_hash=v_hash for update;
 if not found then raise exception 'invalid_invitation'; end if;
 return admin.claim_first_owner(p_display_name);
end $$;
revoke execute on function admin.claim_invited_first_owner(text,text) from public, anon, service_role;
grant execute on function admin.claim_invited_first_owner(text,text) to authenticated;
-- Legacy SQL-generated SHA-256 codes do not meet the approved password-hashing design.
-- Do not issue more until server-side peppered Argon2id/bcrypt recovery is implemented.

notify pgrst, 'reload schema';


-- Preview-only preflight: provides no ownership or profile privileges. The
-- final claim repeats all checks under a lock and additionally requires MFA.
-- Only authenticated, email-confirmed users can test their own invitation.
create function admin.validate_first_owner_invitation(p_invitation_token text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_hash bytea;
begin
 if v_uid is null or coalesce(p_invitation_token,'') !~ '^[0-9a-fA-F]{64}$' then return false; end if;
 if not exists (select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null and lower(u.email)=v_email and v_email<>'') then return false; end if;
 v_hash := extensions.digest(decode(p_invitation_token,'hex'),'sha256');
 return exists(select 1 from admin.admin_bootstrap_state s where s.id=true and s.owner_claimed_at is null and s.owner_auth_user_id is null)
  and exists(select 1 from admin.admin_invitations i where i.invitation_kind='bootstrap' and i.invited_by is null and i.intended_role_key='super_admin' and nullif(trim(i.operator_authorization_ref),'') is not null and i.status='pending' and i.accepted_auth_user_id is null and i.expires_at>now() and i.expires_at<=i.created_at+interval '72 hours' and lower(i.email::text)=v_email and i.token_hash=v_hash);
end $$;
revoke execute on function admin.validate_first_owner_invitation(text) from public, anon, service_role;
grant execute on function admin.validate_first_owner_invitation(text) to authenticated;
notify pgrst, 'reload schema';


-- Public boolean only: no invitation, email, token, user or profile details.
-- This is presentation state, not authorization to claim the owner seat.
create function public.first_admin_setup_available() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from admin.admin_bootstrap_state s where s.id=true and s.owner_claimed_at is null and s.owner_auth_user_id is null and s.bootstrap_disabled_at is null)
$$;
revoke all on function public.first_admin_setup_available() from public, anon, authenticated, service_role;
grant execute on function public.first_admin_setup_available() to anon, authenticated;
notify pgrst, 'reload schema';


-- Applied to the dedicated Preview project. The synthetic rollback test does not
-- establish real marketplace connectivity or public application functionality.
-- Preview-only bridge to the real marketplace schema when provisioned in this
-- same database. It does not create marketplace tables, expose private columns,
-- or make the app's DATABASE_URL point here. Permissions remain server-enforced.
create function admin.marketplace_review_queue(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_kind is null or p_kind not in ('creator','campaign') then raise exception 'invalid_kind'; end if;
 if not admin.has_permission(case when p_kind='creator' then 'creators.review' else 'campaigns.review' end) then raise exception 'not_authorized'; end if;
 if pg_catalog.to_regclass('public.creators') is null or pg_catalog.to_regclass('public.campaigns') is null or pg_catalog.to_regclass('public.applications') is null then raise exception 'marketplace_not_connected'; end if;
 if p_kind='creator' then
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at desc),'[]'::jsonb) into result from
   (select id,name as display_name,status,verification_status,platform,category,followers,location,instagram,youtube,profile_url,bio,created_at from public.creators order by (status='pending') desc,created_at desc,id desc limit 200) q;
 else
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at desc),'[]'::jsonb) into result from
   (select id,title,business_name,status,verification_status,description,budget,category,location,language,format,website,expires_at,created_at from public.campaigns order by (status='pending') desc,created_at desc,id desc limit 200) q;
 end if;
 return result;
end $$;
create function admin.marketplace_review_decision(p_kind text,p_id uuid,p_action text,p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; new_status text; valid_profile boolean; deadline timestamp;
begin
 if p_kind is null or p_kind not in ('creator','campaign') or p_action is null or p_action not in ('approve','reject') or p_id is null then raise exception 'invalid_action'; end if;
 if p_action='reject' and (length(trim(coalesce(p_reason,'')))<1 or length(trim(p_reason))>1000) then raise exception 'reason_required'; end if;
 if not admin.has_permission(case when p_kind='creator' and p_action='approve' then 'creators.approve' when p_kind='creator' then 'creators.review' when p_action='approve' then 'campaigns.publish' else 'campaigns.review' end) then raise exception 'not_authorized'; end if;
 if pg_catalog.to_regclass('public.creators') is null or pg_catalog.to_regclass('public.campaigns') is null or pg_catalog.to_regclass('public.applications') is null then raise exception 'marketplace_not_connected'; end if;
 if p_kind='creator' then
  select status,(category is not null and coalesce(nullif(trim(profile_url),''),nullif(trim(instagram),''),nullif(trim(youtube),'')) is not null) into prior,valid_profile from public.creators where id=p_id for update;
  if not found or prior<>'pending' then raise exception 'invalid_transition'; end if;
  if p_action='approve' and not valid_profile then raise exception 'profile_incomplete'; end if;
  new_status:=case when p_action='approve' then 'approved' else 'rejected' end;
  update public.creators set status=new_status,verification_status=case when p_action='approve' then 'verified' else 'failed' end,verified_followers=case when p_action='approve' then followers else null end,moderation_note=case when p_action='reject' then trim(p_reason) else null end,reviewed_at=now(),listed_at=case when p_action='approve' then now() else listed_at end,updated_at=now() where id=p_id;
 else
  select status,expires_at into prior,deadline from public.campaigns where id=p_id for update;
  if not found or prior<>'pending' then raise exception 'invalid_transition'; end if;
  if p_action='approve' and (deadline is null or deadline<=now()) then raise exception 'campaign_expired'; end if;
  new_status:=case when p_action='approve' then 'open' else 'rejected' end;
  update public.campaigns set status=new_status,verification_status=case when p_action='approve' then 'verified' else 'failed' end,moderation_note=case when p_action='reject' then trim(p_reason) else null end,reviewed_at=now(),updated_at=now() where id=p_id;
 end if;
 perform audit.append_audit(auth.uid(),'marketplace.'||p_kind||'.'||p_action,p_kind,p_id::text,'success',jsonb_build_object('from_status',prior,'to_status',new_status));
end $$;
revoke all on function admin.marketplace_review_queue(text),admin.marketplace_review_decision(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function admin.marketplace_review_queue(text),admin.marketplace_review_decision(text,uuid,text,text) to authenticated;
notify pgrst,'reload schema';

-- Expose only these narrow operations through the already-exposed public API.
-- The target functions retain all server-side checks. Do not expose admin schema.
create function public.production_admin_register_session() returns void language sql security definer set search_path='' as $$ select admin.register_my_session() $$;
create function public.production_admin_validate_invitation(p_invitation_token text) returns boolean language sql stable security definer set search_path='' as $$ select admin.validate_first_owner_invitation(p_invitation_token) $$;
create function public.production_admin_claim_owner(p_display_name text,p_invitation_token text) returns uuid language sql security definer set search_path='' as $$ select admin.claim_invited_first_owner(p_display_name,p_invitation_token) $$;
create function public.production_admin_review_queue(p_kind text) returns jsonb language sql security definer set search_path='' as $$ select admin.marketplace_review_queue(p_kind) $$;
create function public.production_admin_review_decision(p_kind text,p_id uuid,p_action text,p_reason text default null) returns void language sql security definer set search_path='' as $$ select admin.marketplace_review_decision(p_kind,p_id,p_action,p_reason) $$;
revoke all on function public.production_admin_register_session(),public.production_admin_validate_invitation(text),public.production_admin_claim_owner(text,text),public.production_admin_review_queue(text),public.production_admin_review_decision(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.production_admin_register_session(),public.production_admin_validate_invitation(text),public.production_admin_claim_owner(text,text),public.production_admin_review_queue(text),public.production_admin_review_decision(text,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
