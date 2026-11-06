-- Preview-only synthetic identities and invitation. Nothing persists.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','preflight-a@example.invalid',now()),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','preflight-b@example.invalid',now()),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','preflight-c@example.invalid',null);
insert into admin.admin_invitations(email,invitation_kind,intended_role_key,operator_authorization_ref,expires_at,token_hash)
values ('preflight-a@example.invalid','bootstrap','super_admin','synthetic-approval',now()+interval '1 hour',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'));
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"preflight-a@example.invalid","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
 if not admin.validate_first_owner_invitation(repeat('ab',32)) then raise exception 'valid invitation rejected'; end if;
 if admin.validate_first_owner_invitation(repeat('cd',32)) or admin.validate_first_owner_invitation('bad') then raise exception 'bad token accepted'; end if;
 perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"preflight-b@example.invalid"}',true);
 if admin.validate_first_owner_invitation(repeat('ab',32)) then raise exception 'other user accepted'; end if;
 perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","email":"preflight-a@example.invalid"}',true);
 if admin.validate_first_owner_invitation(repeat('ab',32)) then raise exception 'unconfirmed identity accepted'; end if;
 perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"preflight-a@example.invalid"}',true);
end $$;
reset role;
update admin.admin_invitations set created_at=now()-interval '2 hours', expires_at=now()-interval '1 minute' where email='preflight-a@example.invalid';
set local role authenticated;
do $$ begin if admin.validate_first_owner_invitation(repeat('ab',32)) then raise exception 'expired invitation accepted'; end if; end $$;
reset role;
rollback;
