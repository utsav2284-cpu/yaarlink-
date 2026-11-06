-- Run only in an isolated Preview database with an unclaimed seat.
-- All identities, tokens and state are synthetic and the transaction rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bootstrap-synthetic@example.invalid',now());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','totp','verified',now(),now());
insert into admin.admin_invitations(email,invitation_kind,intended_role_key,operator_authorization_ref,expires_at,token_hash) values ('bootstrap-synthetic@example.invalid','bootstrap','super_admin','synthetic-approval',now()+interval '1 hour',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'));
select set_config('request.jwt.claims',jsonb_build_object('sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email','bootstrap-synthetic@example.invalid','aal','aal2','session_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
do $$ begin
 begin perform admin.claim_first_owner('Synthetic'); raise exception 'direct claim allowed'; exception when insufficient_privilege then null; end;
 begin perform admin.claim_invited_first_owner('Synthetic',repeat('cd',32)); raise exception 'wrong token allowed'; exception when raise_exception then if sqlerrm<>'invalid_invitation' then raise; end if; end;
 if admin.claim_invited_first_owner('Synthetic',repeat('ab',32)) <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid then raise exception 'wrong owner'; end if;
 begin perform admin.claim_invited_first_owner('Synthetic',repeat('ab',32)); raise exception 'replay allowed'; exception when raise_exception then if sqlerrm<>'bootstrap_locked' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from admin.admin_profiles where auth_user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and is_owner and status='active') then raise exception 'profile missing'; end if;
 if not exists(select 1 from audit.audit_log where action='owner.claimed') then raise exception 'audit missing'; end if;
end $$;
rollback;
