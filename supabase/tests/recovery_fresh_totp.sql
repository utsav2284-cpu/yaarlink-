-- Preview only; all identities/state synthetic, transaction rolls back.
begin;
grant preview_recovery_runtime to postgres with set true;
insert into auth.users(id,email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','fresh-synthetic@example.invalid');
insert into admin.admin_profiles(auth_user_id,display_name,email_snapshot,status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Synthetic','fresh-synthetic@example.invalid','active');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','totp','verified',now(),now());
insert into admin.admin_session_registry(session_id,auth_user_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role preview_recovery_runtime;
do $$
declare c jsonb; allowed boolean;
begin
 c:=jsonb_build_object('sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','session_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()))::bigint)));
 perform set_config('request.jwt.claims',c::text,true);
 select admin.is_active_admin() and admin.has_aal2() and admin.session_is_current() and admin.has_verified_totp_factor() and admin.recovery_has_fresh_totp() into allowed;
 if not allowed then raise exception 'fresh valid generation denied'; end if;
 c:=jsonb_set(c,'{amr,0,timestamp}',to_jsonb(floor(extract(epoch from now()))::bigint-601));
 perform set_config('request.jwt.claims',c::text,true);
 select admin.is_active_admin() and admin.has_aal2() and admin.session_is_current() and admin.has_verified_totp_factor() and admin.recovery_has_fresh_totp() into allowed;
 if allowed then raise exception 'stale generation allowed'; end if;
 perform set_config('request.jwt.claims','{"amr":{"method":"totp"}}',true);
 if admin.recovery_has_fresh_totp() then raise exception 'malformed amr allowed'; end if;
 perform set_config('request.jwt.claims','{"amr":[{"method":"totp","timestamp":"invalid"}]}',true);
 if admin.recovery_has_fresh_totp() then raise exception 'malformed timestamp allowed'; end if;
end $$;
reset role;
rollback;
