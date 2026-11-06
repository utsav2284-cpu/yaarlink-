-- Historical Preview SQL, read from migration record. Offline reconstruction only.
create or replace function audit.append_audit(p_actor uuid, p_action text, p_resource_type text, p_resource_id text, p_outcome text, p_after jsonb default null, p_before jsonb default null, p_reason text default null, p_metadata jsonb default '{}'::jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare v_prev bytea; v_id bigint; v_hash bytea; v_roles text[]; v_now timestamptz := clock_timestamp();
begin
 perform pg_advisory_xact_lock(727001);
 select last_row_hash into v_prev from audit.audit_chain_head where id=true for update;
 select array_agg(role_key order by role_key) into v_roles from admin.admin_role_assignments where auth_user_id=p_actor and is_current and (expires_at is null or expires_at>now());
 insert into audit.audit_log(prev_hash,row_hash,occurred_at,actor_auth_user_id,actor_profile_id,actor_role_snapshot,action,resource_type,resource_id,outcome,aal_at_action,after_state,before_state,reason,metadata) values (v_prev, decode(repeat('00',32),'hex'), v_now, p_actor, p_actor, coalesce(v_roles,array[]::text[]), p_action, p_resource_type, p_resource_id, p_outcome, 'service', p_after, p_before, p_reason, coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 v_hash := extensions.digest(decode('796161726c696e6b2d61756469742d763100','hex') || v_prev || audit._enc(v_id::text::bytea) || audit._enc(to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')::bytea) || audit._enc(coalesce(p_actor::text,'')::bytea) || audit._enc(coalesce(p_actor::text,'')::bytea) || audit._enc(coalesce(array_to_string(v_roles,','),'')::bytea) || audit._enc(p_action::bytea) || audit._enc(p_resource_type::bytea) || audit._enc(coalesce(p_resource_id,'')::bytea) || audit._enc(p_outcome::bytea) || audit._enc('service'::bytea) || audit._enc(null::bytea) || audit._enc(null::bytea) || audit._enc(null::bytea) || audit._enc(coalesce(p_before::text,'{}')::bytea) || audit._enc(coalesce(p_after::text,'{}')::bytea) || audit._enc(p_reason::bytea) || audit._enc(coalesce(p_metadata,'{}'::jsonb)::text::bytea), 'sha256');
 update audit.audit_log set row_hash=v_hash where id=v_id;
 update audit.audit_chain_head set last_id=v_id, last_row_hash=v_hash, updated_at=now() where id=true;
 return v_id;
end $$;
revoke execute on function audit.append_audit(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function audit.append_audit(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) to service_role;
