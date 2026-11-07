-- Prevent the restricted runtime from reversing previously recorded state.
-- This does not grant the runtime a login or a way to clear recovery pending.
create function admin.guard_recovery_runtime_monotonic() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user = 'preview_recovery_runtime' then
  if tg_table_name = 'admin_recovery_codes' then
   if (old.used_at is not null and new.used_at is distinct from old.used_at) or (old.invalidated_at is not null and new.invalidated_at is distinct from old.invalidated_at) then
    raise exception 'recovery state cannot be reversed';
   end if;
  elsif tg_table_name = 'admin_session_registry' then
   if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'session revocation cannot be reversed';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke execute on function admin.guard_recovery_runtime_monotonic() from public, anon, authenticated, service_role;
create trigger recovery_runtime_monotonic_codes before update on admin.admin_recovery_codes for each row execute function admin.guard_recovery_runtime_monotonic();
create trigger recovery_runtime_monotonic_sessions before update on admin.admin_session_registry for each row execute function admin.guard_recovery_runtime_monotonic();
