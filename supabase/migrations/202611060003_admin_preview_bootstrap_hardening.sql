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
revoke execute on function admin.generate_my_recovery_codes() from authenticated;
notify pgrst, 'reload schema';
