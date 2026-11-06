-- CANDIDATE ONLY. Durable one-attempt reservation, not an owner grant.
create table admin.owner_auth_invite_reservations (
 id boolean primary key default true check (id=true),
 invitation_id uuid not null unique references admin.admin_invitations(id) on delete restrict,
 reserved_at timestamptz not null default now()
);
alter table admin.owner_auth_invite_reservations enable row level security;
revoke all on admin.owner_auth_invite_reservations from public,anon,authenticated,service_role;

create function admin.reserve_owner_auth_invitation_operator()
returns boolean language plpgsql security invoker set search_path='' as $$
declare s record; v_invitation uuid;
begin
 if session_user <> 'postgres' or current_user <> 'postgres' or current_database() <> 'postgres'
    or not coalesce((select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid()),false)
 then raise exception 'operator_identity_or_tls_failed'; end if;
 select owner_claimed_at,owner_auth_user_id,bootstrap_disabled_at into s
 from admin.admin_bootstrap_state where id=true for update;
 if not found or s.owner_claimed_at is not null or s.owner_auth_user_id is not null or s.bootstrap_disabled_at is not null
 then raise exception 'bootstrap_unavailable'; end if;
 if exists(select 1 from admin.owner_auth_invite_reservations) or exists(select 1 from admin.admin_profiles)
    or exists(select 1 from auth.users where lower(email)='utsavkumar20518@gmail.com')
 then raise exception 'auth_invitation_requires_operator_review'; end if;
 if (select count(*) from admin.admin_invitations where invitation_kind='bootstrap' and status='pending') <> 1
 then raise exception 'bootstrap_invitation_unavailable'; end if;
 select id into v_invitation from admin.admin_invitations
 where invitation_kind='bootstrap' and status='pending' and expires_at>now()
   and lower(email::text)='utsavkumar20518@gmail.com' and intended_role_key='super_admin'
   and operator_authorization_ref='user-approved-production-owner'
   and octet_length(token_hash)=32 for update;
 if not found then raise exception 'bootstrap_invitation_unavailable'; end if;
 insert into admin.owner_auth_invite_reservations(id,invitation_id) values (true,v_invitation);
 perform audit.append_audit(null,'bootstrap.auth_invitation_reserved','admin_invitation',v_invitation::text,'success','{}'::jsonb);
 return true;
end $$;
revoke all on function admin.reserve_owner_auth_invitation_operator() from public,anon,authenticated,service_role;
grant execute on function admin.reserve_owner_auth_invitation_operator() to postgres;
