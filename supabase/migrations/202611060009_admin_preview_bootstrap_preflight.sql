-- Preview-only preflight: provides no ownership or profile privileges. The
-- final claim repeats all checks under a lock and additionally requires MFA.
-- Only authenticated, email-confirmed users can test their own invitation.
create function admin.validate_first_owner_invitation(p_invitation_token text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_hash bytea;
begin
 if v_uid is null or coalesce(p_invitation_token,'') !~ '^[0-9a-fA-F]{64}$' then return false; end if;
 if not exists (select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null and lower(u.email)=v_email and v_email<>'') then return false; end if;
 v_hash := extensions.digest(decode(p_invitation_token,'hex'),'sha256');
 return exists(select 1 from admin.admin_bootstrap_state s where s.id=true and s.owner_claimed_at is null and s.owner_auth_user_id is null)
  and exists(select 1 from admin.admin_invitations i where i.invitation_kind='bootstrap' and i.invited_by is null and i.intended_role_key='super_admin' and nullif(trim(i.operator_authorization_ref),'') is not null and i.status='pending' and i.accepted_auth_user_id is null and i.expires_at>now() and i.expires_at<=i.created_at+interval '72 hours' and lower(i.email::text)=v_email and i.token_hash=v_hash);
end $$;
revoke execute on function admin.validate_first_owner_invitation(text) from public, anon, service_role;
grant execute on function admin.validate_first_owner_invitation(text) to authenticated;
notify pgrst, 'reload schema';
