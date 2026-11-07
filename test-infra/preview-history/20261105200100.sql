-- Historical Preview SQL, read from migration record. Offline reconstruction only.
-- This definition was superseded by later hardening; never deploy it.
create or replace function admin.generate_my_recovery_codes() returns setof text language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_code text; i int;
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if not admin.is_active_admin() then raise exception 'not_active_admin'; end if;
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
