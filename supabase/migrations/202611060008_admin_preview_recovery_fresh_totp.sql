-- Recovery-code generation/rotation requires a recent TOTP event in the
-- verified JWT, in addition to live factor, AAL2 and session checks.
-- This function alone does not authenticate the JWT; the trusted server must
-- validate the exact token with Preview Auth before supplying claims.
create function admin.recovery_has_fresh_totp() returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from jsonb_array_elements(
   case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end
  ) as e(value)
  where e.value->>'method'='totp'
    and case when (e.value->>'timestamp') ~ '^[0-9]{1,12}$'
     then (e.value->>'timestamp')::numeric between extract(epoch from now())-600 and extract(epoch from now())
     else false end
 )
$$;
revoke execute on function admin.recovery_has_fresh_totp() from public, anon, authenticated, service_role;
grant execute on function admin.recovery_has_fresh_totp() to preview_recovery_runtime;
