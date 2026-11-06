-- CANDIDATE ONLY: DO NOT APPLY TO A HOSTED PROJECT.
-- Depends on the existing token-bound Preview claim and requires a verified
-- Google identity and a personally set password in addition to all of that
-- claim's existing email, live TOTP, AAL2, freshness and locking checks.
-- Google identity alone is never an owner grant: the independent operator's
-- one-time setup token remains mandatory and is never stored in plaintext.
create function admin.claim_google_first_owner(p_display_name text, p_setup_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
 if v_uid is null or v_email = '' or not exists (
   select 1 from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null
     and lower(u.email) = v_email and coalesce(u.encrypted_password,'') <> ''
     and exists (select 1 from auth.identities i
       where i.user_id = u.id and i.provider = 'google'
         and lower(coalesce(i.identity_data->>'email','')) = v_email
         and i.identity_data->>'email_verified' = 'true')
 ) then raise exception 'verified_google_identity_and_password_required'; end if;
 return admin.claim_invited_first_owner(p_display_name,p_setup_token);
end $$;
-- No other client-facing entry point can bypass the Google identity check.
revoke execute on function admin.claim_invited_first_owner(text,text) from public,anon,authenticated,service_role;
revoke execute on function admin.claim_google_first_owner(text,text) from public,anon,authenticated,service_role;
grant execute on function admin.claim_google_first_owner(text,text) to authenticated;
