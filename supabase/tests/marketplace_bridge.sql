-- Dedicated EMPTY Preview only; refuses to run if marketplace tables already exist.
-- Synthetic records and DDL are rolled back. Never run this test against Production.
begin;
do $$ begin
 if to_regclass('public.creators') is not null or to_regclass('public.campaigns') is not null or to_regclass('public.applications') is not null then raise exception 'test_requires_empty_marketplace'; end if;
 if has_function_privilege('anon','admin.marketplace_review_queue(text)','execute') or has_function_privilege('anon','admin.marketplace_review_decision(text,uuid,text,text)','execute') then raise exception 'anonymous_execution_granted'; end if;
end $$;
create table public.creators (id uuid primary key,name text,status text,verification_status text,platform text,category text,followers integer,location text,instagram text,youtube text,profile_url text,bio text,moderation_note text,reviewed_at timestamp,listed_at timestamp,created_at timestamp default now(),updated_at timestamp);
create table public.campaigns (id uuid primary key,title text,business_name text,status text,verification_status text,description text,budget integer,category text,location text,language text,format text,website text,expires_at timestamp,moderation_note text,reviewed_at timestamp,created_at timestamp default now(),updated_at timestamp);
create table public.applications (id uuid primary key);
insert into auth.users(id,email,email_confirmed_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','marketplace-synthetic@example.invalid',now());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','totp','verified',now(),now());
insert into admin.admin_invitations(email,invitation_kind,intended_role_key,operator_authorization_ref,expires_at,token_hash) values ('marketplace-synthetic@example.invalid','bootstrap','super_admin','synthetic-approval',now()+interval '1 hour',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'));
insert into public.creators(id,name,status,verification_status,category,profile_url) values ('11111111-1111-1111-1111-111111111111','Synthetic','pending','pending','Other','https://example.invalid/profile');
insert into public.campaigns(id,title,business_name,status,verification_status,expires_at) values ('22222222-2222-2222-2222-222222222222','Synthetic','Synthetic','pending','pending',now()+interval '1 day'),('33333333-3333-3333-3333-333333333333','Expired','Synthetic','pending','pending',now()-interval '1 day');
select set_config('request.jwt.claims',jsonb_build_object('sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email','marketplace-synthetic@example.invalid','aal','aal2','session_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
select admin.claim_invited_first_owner('Synthetic',repeat('ab',32));
select admin.register_my_session();
do $$ begin
 if jsonb_array_length(admin.marketplace_review_queue('creator'))<>1 or jsonb_array_length(admin.marketplace_review_queue('campaign'))<>2 then raise exception 'queue_wrong'; end if;
 begin perform admin.marketplace_review_decision('campaign','33333333-3333-3333-3333-333333333333','approve'); raise exception 'expired_allowed'; exception when raise_exception then if sqlerrm<>'campaign_expired' then raise; end if; end;
 begin perform admin.marketplace_review_decision('creator','11111111-1111-1111-1111-111111111111','reject'); raise exception 'empty_rejection_allowed'; exception when raise_exception then if sqlerrm<>'reason_required' then raise; end if; end;
 perform admin.marketplace_review_decision('creator','11111111-1111-1111-1111-111111111111','approve');
 perform admin.marketplace_review_decision('campaign','22222222-2222-2222-2222-222222222222','approve');
 begin perform admin.marketplace_review_decision('creator','11111111-1111-1111-1111-111111111111','approve'); raise exception 'duplicate_allowed'; exception when raise_exception then if sqlerrm<>'invalid_transition' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email','marketplace-synthetic@example.invalid','aal','aal1','session_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text,true);
do $$ begin
 begin perform admin.marketplace_review_queue('creator'); raise exception 'aal1_allowed'; exception when raise_exception then if sqlerrm<>'not_authorized' then raise; end if; end;
 begin perform admin.marketplace_review_decision('campaign','22222222-2222-2222-2222-222222222222','reject','reason'); raise exception 'aal1_mutation_allowed'; exception when raise_exception then if sqlerrm<>'not_authorized' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email','marketplace-synthetic@example.invalid','aal','aal2','session_id','dddddddd-dddd-dddd-dddd-dddddddddddd')::text,true);
do $$ begin begin perform admin.marketplace_review_queue('creator'); raise exception 'unregistered_session_allowed'; exception when raise_exception then if sqlerrm<>'not_authorized' then raise; end if; end; end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.creators where status='approved' and verification_status='verified') then raise exception 'creator_not_approved'; end if;
 if not exists(select 1 from public.campaigns where status='open' and verification_status='verified' and expires_at>now()) then raise exception 'campaign_not_open'; end if;
 if (select count(*) from audit.audit_log where action in ('marketplace.creator.approve','marketplace.campaign.approve'))<>2 then raise exception 'audit_missing'; end if;
end $$;
rollback;
