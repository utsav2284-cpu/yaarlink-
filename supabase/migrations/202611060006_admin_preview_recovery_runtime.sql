-- Dedicated role has no login and is not granted to authenticator, anon, authenticated or service_role.
-- A trusted operator must separately create and provision a Preview-only login in a secret store.
create role preview_recovery_runtime nologin noinherit nobypassrls;
grant usage on schema admin to preview_recovery_runtime;
grant execute on function admin.is_active_admin(), admin.has_aal2(), admin.session_is_current(), admin.has_verified_totp_factor() to preview_recovery_runtime;
-- The server takes a transaction advisory lock, so no profile UPDATE privilege is needed.
grant select(auth_user_id,status) on admin.admin_profiles to preview_recovery_runtime;
create policy recovery_runtime_profile on admin.admin_profiles for select to preview_recovery_runtime using (auth.uid()=auth_user_id);
grant select on admin.admin_recovery_codes to preview_recovery_runtime;
grant insert(auth_user_id,code_index,code_hash,expires_at) on admin.admin_recovery_codes to preview_recovery_runtime;
grant update(used_at,invalidated_at) on admin.admin_recovery_codes to preview_recovery_runtime;
create policy recovery_runtime_codes_select on admin.admin_recovery_codes for select to preview_recovery_runtime using (auth.uid()=auth_user_id);
create policy recovery_runtime_codes_insert on admin.admin_recovery_codes for insert to preview_recovery_runtime with check (auth.uid()=auth_user_id and used_at is null and invalidated_at is null and expires_at is not null);
create policy recovery_runtime_codes_update on admin.admin_recovery_codes for update to preview_recovery_runtime using (auth.uid()=auth_user_id) with check (auth.uid()=auth_user_id and (used_at is not null or invalidated_at is not null));
grant select on admin.admin_recovery_controls to preview_recovery_runtime;
grant insert(auth_user_id,recovery_pending,requested_at) on admin.admin_recovery_controls to preview_recovery_runtime;
grant update(recovery_pending,requested_at) on admin.admin_recovery_controls to preview_recovery_runtime;
create policy recovery_runtime_controls_select on admin.admin_recovery_controls for select to preview_recovery_runtime using (auth.uid()=auth_user_id);
create policy recovery_runtime_controls_insert on admin.admin_recovery_controls for insert to preview_recovery_runtime with check (auth.uid()=auth_user_id and recovery_pending);
create policy recovery_runtime_controls_update on admin.admin_recovery_controls for update to preview_recovery_runtime using (auth.uid()=auth_user_id) with check (auth.uid()=auth_user_id and recovery_pending);
grant select(auth_user_id,attempted_at) on admin.admin_recovery_attempts to preview_recovery_runtime;
grant insert(auth_user_id,attempted_at) on admin.admin_recovery_attempts to preview_recovery_runtime;
create policy recovery_runtime_attempts_select on admin.admin_recovery_attempts for select to preview_recovery_runtime using (auth.uid()=auth_user_id);
create policy recovery_runtime_attempts_insert on admin.admin_recovery_attempts for insert to preview_recovery_runtime with check (auth.uid()=auth_user_id);
grant select(auth_user_id,revoked_at) on admin.admin_session_registry to preview_recovery_runtime;
grant update(revoked_at,revoke_reason) on admin.admin_session_registry to preview_recovery_runtime;
create policy recovery_runtime_sessions_select on admin.admin_session_registry for select to preview_recovery_runtime using (auth.uid()=auth_user_id);
create policy recovery_runtime_sessions_update on admin.admin_session_registry for update to preview_recovery_runtime using (auth.uid()=auth_user_id) with check (auth.uid()=auth_user_id and revoked_at is not null);
-- Fixed event vocabulary, no plaintext or hashes in events. Not accessible to app roles.
create function admin.log_recovery_event(p_event text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); failed boolean;
begin
 if u is null or not exists(select 1 from admin.admin_profiles where auth_user_id=u) then raise exception 'not_authorized'; end if;
 if p_event not in ('recovery_codes_regenerated','recovery_code_failed','recovery_rate_limited','recovery_code_used') then raise exception 'invalid_event'; end if;
 failed := p_event in ('recovery_code_failed','recovery_rate_limited');
 insert into security.security_events(event_type,severity,auth_user_id,actor_auth_user_id,detail) values (case when failed then 'recovery_code_misuse' else 'other' end,case when failed then 'medium' else 'info' end,u,u,jsonb_build_object('action',p_event));
 if not failed then insert into admin.account_recovery_events(auth_user_id,event_type,requested_by) values (u,p_event,u); end if;
 perform audit.append_audit(u,p_event,'admin_profile',u::text,case when failed then 'denied' else 'success' end,'{}'::jsonb);
end $$;
revoke execute on function admin.log_recovery_event(text) from public,anon,authenticated,service_role;
grant execute on function admin.log_recovery_event(text) to preview_recovery_runtime;
