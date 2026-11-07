-- LOCAL SCRATCH DATABASE ONLY. Never install this marker in a hosted project.
-- This is deliberately outside migrations; it is not part of the Preview schema.
create table admin.local_testing_guard (marker text primary key check (marker='synthetic-only'));
insert into admin.local_testing_guard values ('synthetic-only');
alter table admin.local_testing_guard enable row level security;
revoke all on admin.local_testing_guard from public, anon, authenticated, service_role;
