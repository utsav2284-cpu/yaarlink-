-- YaarLink Admin Preview v2 — Migration 1: schemas, fail-closed stubs, identity + RBAC
-- Target: yaarlink-admin-preview-v2 (qwngmsedyepghskoagaj) ONLY. Never apply to Production.
create schema if not exists admin;
create schema if not exists audit;
create schema if not exists security;
create schema if not exists preview;
create schema if not exists ops;
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
