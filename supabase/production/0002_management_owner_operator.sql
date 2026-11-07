-- CANDIDATE ONLY. Requires a separately verified migration and postflight.
-- This function is for the trusted postgres management connection only. It is
-- not a browser, service-role or first-user-becomes-owner endpoint.
create function admin.provision_first_owner_operator(p_hash bytea)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s record; v_invitation uuid;
begin
 if session_user <> 'postgres' or current_user <> 'postgres' or current_database() <> 'postgres'
    or not coalesce((select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid()),false)
 then raise exception 'operator_identity_or_tls_failed'; end if;
 if p_hash is null or pg_catalog.octet_length(p_hash) <> 32 then raise exception 'invalid_input'; end if;
 select owner_claimed_at,owner_auth_user_id,bootstrap_disabled_at into s
 from admin.admin_bootstrap_state where id=true for update;
 if not found or s.owner_claimed_at is not null or s.owner_auth_user_id is not null or s.bootstrap_disabled_at is not null
 then raise exception 'bootstrap_unavailable'; end if;
 if exists(select 1 from admin.admin_profiles)
    or exists(select 1 from admin.admin_invitations where invitation_kind='bootstrap' and status='pending')
    or exists(select 1 from auth.users where lower(email)='utsavkumar20518@gmail.com')
 then raise exception 'bootstrap_requires_operator_review'; end if;
 insert into admin.admin_invitations(email, invitation_kind, invited_by, operator_authorization_ref, intended_role_key, expires_at, token_hash)
 values ('utsavkumar20518@gmail.com','bootstrap',null,'user-approved-production-owner','super_admin',pg_catalog.now()+interval '24 hours',p_hash)
 returning id into v_invitation;
 perform audit.append_audit(null,'bootstrap.invitation_created','admin_invitation',v_invitation::text,'success','{}'::jsonb);
 return true;
end $$;
revoke all on function admin.provision_first_owner_operator(bytea) from public, anon, authenticated, service_role;
grant execute on function admin.provision_first_owner_operator(bytea) to postgres;
