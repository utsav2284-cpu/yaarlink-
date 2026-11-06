-- Historical Preview SQL, read from migration record. Offline reconstruction only.
alter table admin.identity_operations drop constraint identity_operations_actor_auth_user_id_fkey;
alter table admin.identity_operations add constraint identity_operations_actor_auth_user_id_fkey foreign key (actor_auth_user_id) references auth.users(id) on delete restrict;
