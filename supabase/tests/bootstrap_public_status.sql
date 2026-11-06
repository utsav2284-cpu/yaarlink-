-- Preview only; rolled back synthetic ownership claim.
begin;
do $$ begin if not public.first_admin_setup_available() then raise exception 'unclaimed not available'; end if; end $$;
insert into auth.users(id,email,email_confirmed_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','status-synthetic@example.invalid',now());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','totp','verified',now(),now());
insert into admin.admin_invitations(email,invitation_kind,intended_role_key,operator_authorization_ref,expires_at,token_hash) values ('status-synthetic@example.invalid','bootstrap','super_admin','synthetic-approval',now()+interval '1 hour',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'));
select set_config('request.jwt.claims',jsonb_build_object('sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email','status-synthetic@example.invalid','aal','aal2','session_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()))::bigint)))::text,true);
set local role authenticated;
select admin.claim_invited_first_owner('Synthetic',repeat('ab',32));
do $$ begin if public.first_admin_setup_available() then raise exception 'claimed still available'; end if; end $$;
reset role;
rollback;
