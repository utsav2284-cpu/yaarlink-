-- Applied to the dedicated Preview project. The synthetic rollback test does not
-- establish real marketplace connectivity or public application functionality.
-- Preview-only bridge to the real marketplace schema when provisioned in this
-- same database. It does not create marketplace tables, expose private columns,
-- or make the app's DATABASE_URL point here. Permissions remain server-enforced.
create function admin.marketplace_review_queue(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_kind is null or p_kind not in ('creator','campaign') then raise exception 'invalid_kind'; end if;
 if not admin.has_permission(case when p_kind='creator' then 'creators.review' else 'campaigns.review' end) then raise exception 'not_authorized'; end if;
 if pg_catalog.to_regclass('public.creators') is null or pg_catalog.to_regclass('public.campaigns') is null or pg_catalog.to_regclass('public.applications') is null then raise exception 'marketplace_not_connected'; end if;
 if p_kind='creator' then
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at desc),'[]'::jsonb) into result from
   (select id,name as display_name,status,verification_status,platform,category,followers,location,instagram,youtube,profile_url,bio,created_at from public.creators order by created_at desc limit 200) q;
 else
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at desc),'[]'::jsonb) into result from
   (select id,title,business_name,status,verification_status,description,budget,category,location,language,format,website,expires_at,created_at from public.campaigns order by created_at desc limit 200) q;
 end if;
 return result;
end $$;
create function admin.marketplace_review_decision(p_kind text,p_id uuid,p_action text,p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; new_status text; valid_profile boolean; deadline timestamp;
begin
 if p_kind is null or p_kind not in ('creator','campaign') or p_action is null or p_action not in ('approve','reject') or p_id is null then raise exception 'invalid_action'; end if;
 if p_action='reject' and (length(trim(coalesce(p_reason,'')))<1 or length(trim(p_reason))>1000) then raise exception 'reason_required'; end if;
 if not admin.has_permission(case when p_kind='creator' and p_action='approve' then 'creators.approve' when p_kind='creator' then 'creators.review' when p_action='approve' then 'campaigns.publish' else 'campaigns.review' end) then raise exception 'not_authorized'; end if;
 if pg_catalog.to_regclass('public.creators') is null or pg_catalog.to_regclass('public.campaigns') is null or pg_catalog.to_regclass('public.applications') is null then raise exception 'marketplace_not_connected'; end if;
 if p_kind='creator' then
  select status,(category is not null and coalesce(nullif(trim(profile_url),''),nullif(trim(instagram),''),nullif(trim(youtube),'')) is not null) into prior,valid_profile from public.creators where id=p_id for update;
  if not found or prior<>'pending' then raise exception 'invalid_transition'; end if;
  if p_action='approve' and not valid_profile then raise exception 'profile_incomplete'; end if;
  new_status:=case when p_action='approve' then 'approved' else 'rejected' end;
  update public.creators set status=new_status,verification_status=case when p_action='approve' then 'verified' else 'failed' end,moderation_note=case when p_action='reject' then trim(p_reason) else null end,reviewed_at=now(),listed_at=case when p_action='approve' then now() else listed_at end,updated_at=now() where id=p_id;
 else
  select status,expires_at into prior,deadline from public.campaigns where id=p_id for update;
  if not found or prior<>'pending' then raise exception 'invalid_transition'; end if;
  if p_action='approve' and (deadline is null or deadline<=now()) then raise exception 'campaign_expired'; end if;
  new_status:=case when p_action='approve' then 'open' else 'rejected' end;
  update public.campaigns set status=new_status,verification_status=case when p_action='approve' then 'verified' else 'failed' end,moderation_note=case when p_action='reject' then trim(p_reason) else null end,reviewed_at=now(),updated_at=now() where id=p_id;
 end if;
 perform audit.append_audit(auth.uid(),'marketplace.'||p_kind||'.'||p_action,p_kind,p_id::text,'success',jsonb_build_object('from_status',prior,'to_status',new_status));
end $$;
revoke all on function admin.marketplace_review_queue(text),admin.marketplace_review_decision(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function admin.marketplace_review_queue(text),admin.marketplace_review_decision(text,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
