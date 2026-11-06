-- Preview-only: least-privilege PostgREST access. No grants to anon or service_role.
-- Current app reads only the two review queues, and writes only through review RPCs.
revoke all privileges on preview.analytics_daily_rollups, preview.campaign_review_decisions, preview.creator_review_decisions, preview.crm_contacts, preview.crm_interactions, preview.moderation_actions, preview.notifications, preview.preview_brands, preview.preview_campaign_applications, preview.preview_campaigns, preview.preview_creators, preview.preview_reports, preview.preview_users, preview.privacy_requests from authenticated;
grant select on preview.preview_creators, preview.preview_campaigns to authenticated;
revoke all privileges on admin.admin_profile_directory, admin.my_profile, admin.my_sessions from authenticated;
revoke select (auth_user_id, created_at, display_name, is_owner, last_login_at, status) on admin.admin_profiles from authenticated;
revoke select (auth_user_id, expires_at, granted_at, is_current, role_key) on admin.admin_role_assignments from authenticated;
revoke select (created_at, last_seen_at, revoked_at, session_id, user_agent) on admin.admin_session_registry from authenticated;
-- Policy expressions invoke has_permission as the calling role. Bootstrap and recovery
-- are the only other admin functions that need authenticated execution.
revoke execute on function admin.current_admin_id(), admin.has_aal2(), admin.has_step_up(text,text), admin.has_verified_totp_factor(), admin.is_active_admin(), admin.session_is_current() from authenticated;
revoke execute on function audit._enc(bytea) from public, anon, authenticated, service_role;
grant usage on schema admin, preview to authenticated;
create or replace function admin.generate_my_recovery_codes() returns setof text language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_code text; i int;
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if not (admin.is_active_admin() and admin.has_aal2() and admin.session_is_current() and admin.has_verified_totp_factor()) then raise exception 'permission_denied'; end if;
 update admin.admin_recovery_codes set invalidated_at=now() where auth_user_id=v_uid and used_at is null and invalidated_at is null;
 for i in 1..8 loop
  v_code := upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,10));
  insert into admin.admin_recovery_codes(auth_user_id,code_hash,code_index) values (v_uid, encode(extensions.digest(convert_to(v_code,'UTF8'),'sha256'),'hex'), i);
  return next v_code;
 end loop;
 perform audit.append_audit(v_uid,'mfa.recovery_codes_generated','admin_profile',v_uid::text,'success','{}'::jsonb);
end $$;
revoke execute on function admin.generate_my_recovery_codes() from public, anon, service_role;
grant execute on function admin.generate_my_recovery_codes() to authenticated;
alter role authenticator set pgrst.db_schemas='public, graphql_public, admin, preview';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
