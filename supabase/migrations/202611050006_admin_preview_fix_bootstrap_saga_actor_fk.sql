-- Applied to Preview as admin_preview_fix_bootstrap_saga_actor_fk (20261105195921).
-- BUG: claim_first_owner inserts identity_operations(actor_auth_user_id) before the admin profile
-- exists; FK to admin_profiles blocked the first-owner claim. Actor now references auth.users.
alter table admin.identity_operations drop constraint identity_operations_actor_auth_user_id_fkey;
alter table admin.identity_operations add constraint identity_operations_actor_auth_user_id_fkey foreign key (actor_auth_user_id) references auth.users(id) on delete restrict;
