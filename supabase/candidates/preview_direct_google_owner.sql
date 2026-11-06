-- PREVIEW CANDIDATE ONLY. Not a migration and not wired to the app.
-- An operator provisions one high-entropy, hash-only setup authorization out
-- of band. No email invitation, Auth user creation, or SMTP is performed here.
create table admin.first_owner_setup_authorizations (
 id boolean primary key default true check(id=true),
 email text not null check(length(email) between 3 and 254 and email=lower(email)),
 token_hash bytea not null check(octet_length(token_hash)=32),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now(),
 check(expires_at > created_at and expires_at <= created_at+interval '72 hours')
);
alter table admin.first_owner_setup_authorizations enable row level security;
revoke all on admin.first_owner_setup_authorizations from public,anon,authenticated,service_role;

create function admin.claim_direct_google_first_owner(p_display_name text,p_setup_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_session uuid; v_totp_time bigint; v_now timestamptz := now(); v_state record;
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if char_length(trim(coalesce(p_display_name,''))) not between 1 and 100 then raise exception 'invalid_display_name'; end if;
 if coalesce(p_setup_token,'') !~ '^[0-9a-fA-F]{64}$' then raise exception 'invalid_setup_authorization'; end if;
 if not exists (select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null
    and lower(u.email)=v_email and v_email<>'' and coalesce(u.encrypted_password,'')<>''
    and exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and lower(coalesce(i.identity_data->>'email',''))=v_email and i.identity_data->>'email_verified'='true'))
 then raise exception 'verified_google_identity_and_password_required'; end if;
 if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception 'aal2_required'; end if;
 if not exists(select 1 from auth.mfa_factors f where f.user_id=v_uid and f.factor_type='totp' and f.status='verified') then raise exception 'verified_totp_required'; end if;
 select max((x->>'timestamp')::bigint) into v_totp_time from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end) x where x->>'method'='totp' and (x->>'timestamp') ~ '^[0-9]{1,12}$';
 if v_totp_time is null or v_totp_time<extract(epoch from v_now-interval '10 minutes') or v_totp_time>extract(epoch from v_now+interval '30 seconds') then raise exception 'fresh_totp_required'; end if;
 begin v_session:=(auth.jwt()->>'session_id')::uuid; exception when invalid_text_representation then raise exception 'invalid_session'; end;
 if v_session is null or not exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=v_uid) then raise exception 'invalid_session'; end if;
 select owner_claimed_at,owner_auth_user_id,bootstrap_disabled_at into v_state from admin.admin_bootstrap_state where id=true for update;
 if not found or v_state.owner_claimed_at is not null or v_state.owner_auth_user_id is not null or v_state.bootstrap_disabled_at is not null then raise exception 'bootstrap_locked'; end if;
 perform 1 from admin.first_owner_setup_authorizations a where a.id=true and a.consumed_at is null and a.expires_at>v_now and a.email=v_email and a.token_hash=extensions.digest(decode(p_setup_token,'hex'),'sha256') for update;
 if not found then raise exception 'invalid_setup_authorization'; end if;
 if exists(select 1 from admin.admin_profiles) then raise exception 'operator_review_required'; end if;
 insert into admin.identity_operations(operation_type,idempotency_key,auth_user_id,actor_auth_user_id,state,payload_summary)
 values('bootstrap_claim','direct-first-owner',v_uid,v_uid,'db_done',jsonb_build_object('auth_identity_validated_at',v_now,'mfa_validated_at',v_now));
 insert into admin.admin_profiles(auth_user_id,display_name,email_snapshot,status,is_owner,invitation_kind)
 values(v_uid,trim(p_display_name),v_email,'invited',true,'bootstrap');
 insert into admin.admin_role_assignments(auth_user_id,role_key) values(v_uid,'super_admin');
 update admin.first_owner_setup_authorizations set consumed_at=v_now where id=true and consumed_at is null;
 if not found then raise exception 'bootstrap_race_lost'; end if;
 update admin.admin_bootstrap_state set owner_claimed_at=v_now,owner_auth_user_id=v_uid,bootstrap_disabled_at=v_now,updated_at=v_now where id=true and owner_claimed_at is null;
 if not found then raise exception 'bootstrap_race_lost'; end if;
 update admin.admin_profiles set status='active',updated_at=v_now where auth_user_id=v_uid;
 insert into admin.admin_session_registry(session_id,auth_user_id,aal_at_issue) values(v_session,v_uid,'aal2');
 insert into admin.admin_mfa_status(auth_user_id,totp_verified_factor_count,has_verified_totp,last_factor_verified_at,last_synced_at,enrollment_required)
 values(v_uid,1,true,v_now,v_now,false) on conflict(auth_user_id) do update set totp_verified_factor_count=1,has_verified_totp=true,last_synced_at=v_now,enrollment_required=false;
 update admin.identity_operations set state='completed',completed_at=v_now,updated_at=v_now where idempotency_key='direct-first-owner';
 perform audit.append_audit(v_uid,'owner.claimed','admin_bootstrap_state','true','success',jsonb_build_object('owner',v_uid));
 return v_uid;
end $$;
revoke execute on function admin.claim_direct_google_first_owner(text,text) from public,anon,authenticated,service_role;
grant execute on function admin.claim_direct_google_first_owner(text,text) to authenticated;
-- When installed as a coordinated migration, retire the old invitation claim
-- entry point to avoid offering an alternative to this Google-only gate.
revoke execute on function admin.claim_invited_first_owner(text,text) from public,anon,authenticated,service_role;
-- The earlier Google wrapper delegates to the invitation claim. If it was
-- separately installed, it must not remain as an alternative claim path.
do $$ begin
 if to_regprocedure('admin.claim_google_first_owner(text,text)') is not null then
   execute 'revoke execute on function admin.claim_google_first_owner(text,text) from public,anon,authenticated,service_role';
 end if;
end $$;
