-- Historical Preview SQL, read from migration record. Offline reconstruction only.
-- Synthetic business seed inserts removed; do not apply this to hosted databases.
insert into admin.admin_permissions(key,description,module,is_sensitive) values ('creators.review','Review creators','creators',false),('creators.approve','Approve creators','creators',true),('campaigns.review','Review campaigns','campaigns',false),('campaigns.publish','Publish campaigns','campaigns',true) on conflict (key) do nothing;
insert into admin.role_permissions(role_key,permission_key) select 'super_admin',key from admin.admin_permissions where key in ('creators.review','creators.approve','campaigns.review','campaigns.publish') on conflict do nothing;
insert into admin.role_permissions(role_key,permission_key) values ('admin','creators.review'),('admin','creators.approve'),('admin','campaigns.review'),('admin','campaigns.publish'),('moderator','creators.review'),('moderator','campaigns.review') on conflict do nothing;
alter table preview.preview_creators drop constraint preview_creators_status_check;
alter table preview.preview_creators add constraint preview_creators_status_check check (status in ('pending_review','active','changes_requested','rejected','suspended','deactivated','flagged'));
alter table preview.preview_creators add column if not exists contact_email citext, add column if not exists instagram_url text, add column if not exists youtube_url text, add column if not exists bio text, add column if not exists verification_status text not null default 'unverified', add column if not exists matching_eligible boolean not null default false, add column if not exists submitted_at timestamptz, add column if not exists reviewed_by uuid references admin.admin_profiles(auth_user_id) on delete restrict, add column if not exists reviewed_at timestamptz, add column if not exists decision_reason text;
alter table preview.preview_campaigns drop constraint preview_campaigns_status_check;
alter table preview.preview_campaigns add constraint preview_campaigns_status_check check (status in ('draft','pending_review','live','scheduled','changes_requested','rejected','paused','ended','completed'));
alter table preview.preview_campaigns add column if not exists description text, add column if not exists target_audience text, add column if not exists creator_requirements text, add column if not exists deliverables text, add column if not exists terms text, add column if not exists reviewed_by uuid references admin.admin_profiles(auth_user_id) on delete restrict, add column if not exists reviewed_at timestamptz, add column if not exists decision_reason text, add column if not exists published_at timestamptz;
create table preview.creator_review_decisions (id uuid primary key default gen_random_uuid(), creator_id uuid not null references preview.preview_creators(id) on delete restrict, admin_id uuid not null references admin.admin_profiles(auth_user_id) on delete restrict, action text not null check (action in ('approve','request_changes','reject','suspend','deactivate','reactivate')), from_status text not null, to_status text not null, reason text, created_at timestamptz not null default now());
create table preview.campaign_review_decisions (id uuid primary key default gen_random_uuid(), campaign_id uuid not null references preview.preview_campaigns(id) on delete restrict, admin_id uuid not null references admin.admin_profiles(auth_user_id) on delete restrict, action text not null check (action in ('approve_publish','request_changes','reject','schedule','pause','resume','end')), from_status text not null, to_status text not null, reason text, created_at timestamptz not null default now());
create table preview.notifications (id uuid primary key default gen_random_uuid(), recipient_type text not null check (recipient_type in ('creator','brand','user')), recipient_id uuid not null, template_key text not null, payload jsonb not null default '{}'::jsonb, channel text not null default 'in_app', status text not null default 'queued' check (status in ('queued','recorded')), created_at timestamptz not null default now());
alter table preview.creator_review_decisions enable row level security; alter table preview.campaign_review_decisions enable row level security; alter table preview.notifications enable row level security;
revoke all on preview.creator_review_decisions, preview.campaign_review_decisions, preview.notifications from anon, authenticated;
grant select on preview.creator_review_decisions to authenticated; grant select on preview.campaign_review_decisions to authenticated; grant select on preview.notifications to authenticated;
create policy creator_decisions_read on preview.creator_review_decisions for select to authenticated using (admin.has_permission('creators.read'));
create policy campaign_decisions_read on preview.campaign_review_decisions for select to authenticated using (admin.has_permission('campaigns.read'));
create policy notifications_read on preview.notifications for select to authenticated using (admin.has_permission('notifications.manage'));
create or replace function preview.review_creator(p_creator_id uuid, p_action text, p_reason text default null) returns preview.preview_creators language plpgsql security definer set search_path='' as $$
declare v_row preview.preview_creators; v_old text; v_to text; v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if p_action='approve' and not admin.has_permission('creators.approve') then raise exception 'permission_denied:creators.approve'; end if;
 if p_action<>'approve' and not admin.has_permission('creators.review') and not admin.has_permission('creators.manage') then raise exception 'permission_denied:creators.review'; end if;
 if p_action in ('suspend','deactivate') and not admin.has_permission('creators.manage') then raise exception 'permission_denied:creators.manage'; end if;
 if p_action in ('request_changes','reject') and coalesce(trim(p_reason),'')='' then raise exception 'reason_required'; end if;
 select * into v_row from preview.preview_creators where id=p_creator_id for update;
 if not found then raise exception 'creator_not_found'; end if;
 v_old := v_row.status;
 v_to := case p_action when 'approve' then 'active' when 'request_changes' then 'changes_requested' when 'reject' then 'rejected' when 'suspend' then 'suspended' when 'deactivate' then 'deactivated' when 'reactivate' then 'active' else null end;
 if v_to is null then raise exception 'invalid_action'; end if;
 if not ((v_old='pending_review' and p_action in ('approve','request_changes','reject')) or (v_old='changes_requested' and p_action in ('approve','reject')) or (v_old='active' and p_action in ('suspend','deactivate')) or (v_old in ('suspended','deactivated') and p_action='reactivate')) then raise exception 'invalid_transition:%->%', v_old, p_action; end if;
 update preview.preview_creators set status=v_to, matching_eligible=(v_to='active'), reviewed_by=v_uid, reviewed_at=now(), decision_reason=p_reason, updated_at=now() where id=p_creator_id returning * into v_row;
 insert into preview.creator_review_decisions(creator_id,admin_id,action,from_status,to_status,reason) values (p_creator_id,v_uid,p_action,v_old,v_to,p_reason);
 insert into preview.notifications(recipient_type,recipient_id,template_key,payload) values ('creator',p_creator_id,'creator.'||p_action,jsonb_build_object('reason',p_reason,'status',v_to));
 perform audit.append_audit(v_uid,'creator.'||p_action,'preview_creator',p_creator_id::text,'success',jsonb_build_object('from',v_old,'to',v_to,'reason',p_reason));
 return v_row;
end $$;
revoke execute on function preview.review_creator(uuid,text,text) from public, anon, service_role; grant execute on function preview.review_creator(uuid,text,text) to authenticated;
create or replace function preview.review_campaign(p_campaign_id uuid, p_action text, p_reason text default null) returns preview.preview_campaigns language plpgsql security definer set search_path='' as $$
declare v_row preview.preview_campaigns; v_old text; v_to text; v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'unauthenticated'; end if;
 if p_action='approve_publish' and not admin.has_permission('campaigns.publish') then raise exception 'permission_denied:campaigns.publish'; end if;
 if p_action<>'approve_publish' and not admin.has_permission('campaigns.review') and not admin.has_permission('campaigns.manage') then raise exception 'permission_denied:campaigns.review'; end if;
 if p_action in ('pause','resume','end','schedule') and not admin.has_permission('campaigns.manage') then raise exception 'permission_denied:campaigns.manage'; end if;
 if p_action in ('request_changes','reject') and coalesce(trim(p_reason),'')='' then raise exception 'reason_required'; end if;
 select * into v_row from preview.preview_campaigns where id=p_campaign_id for update;
 if not found then raise exception 'campaign_not_found'; end if;
 v_old := v_row.status;
 if p_action='approve_publish' then if v_row.starts_on is not null and v_row.starts_on > current_date then v_to:='scheduled'; else v_to:='live'; end if; elsif p_action='request_changes' then v_to:='changes_requested'; elsif p_action='reject' then v_to:='rejected'; elsif p_action='pause' then v_to:='paused'; elsif p_action='resume' then v_to:='live'; elsif p_action='end' then v_to:='completed'; elsif p_action='schedule' then v_to:='scheduled'; else raise exception 'invalid_action'; end if;
 if not ((v_old in ('pending_review','changes_requested') and p_action in ('approve_publish','request_changes','reject')) or (v_old='live' and p_action in ('pause','end')) or (v_old='paused' and p_action in ('resume','end')) or (v_old='scheduled' and p_action in ('end','pause'))) then raise exception 'invalid_transition:%->%', v_old, p_action; end if;
 update preview.preview_campaigns set status=v_to, reviewed_by=v_uid, reviewed_at=now(), decision_reason=p_reason, published_at=case when v_to='live' then now() else published_at end, updated_at=now() where id=p_campaign_id returning * into v_row;
 insert into preview.campaign_review_decisions(campaign_id,admin_id,action,from_status,to_status,reason) values (p_campaign_id,v_uid,p_action,v_old,v_to,p_reason);
 insert into preview.notifications(recipient_type,recipient_id,template_key,payload) values ('brand',v_row.brand_id,'campaign.'||p_action,jsonb_build_object('reason',p_reason,'status',v_to));
 perform audit.append_audit(v_uid,'campaign.'||p_action,'preview_campaign',p_campaign_id::text,'success',jsonb_build_object('from',v_old,'to',v_to,'reason',p_reason));
 return v_row;
end $$;
revoke execute on function preview.review_campaign(uuid,text,text) from public, anon, service_role; grant execute on function preview.review_campaign(uuid,text,text) to authenticated;
