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
