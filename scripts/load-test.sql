-- Load test: 500 people's worth of data, then the app's hottest queries timed
-- as a signed-in member (RLS + two-factor). Everything is rolled back.
--   docker exec -i supabase_db_seeds-tasks psql -U postgres -f - < scripts/load-test.sql
\timing off
\set QUIET on
begin;

-- 500 people (the sign-up trigger creates their profiles)
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       format('load%s@seedsofleadership.ca', i), now(), '{"provider":"google"}', format('{"full_name":"Load User %s","email_verified":true}', i)::jsonb, now(), now()
from generate_series(1, 500) i;

create temp table people as select id, row_number() over () as n from public.profiles where email like 'load%';

-- 20 teams of ~25
insert into public.teams (id, name, created_by) select gen_random_uuid(), 'Team ' || i, (select id from people where n = i) from generate_series(1, 20) i;
insert into public.team_members (team_id, user_id)
select t.id, p.id from (select id, row_number() over () as k from public.teams where name like 'Team %') t
join people p on p.n % 20 = t.k - 1 on conflict do nothing;

-- 300 projects: 60% workspace, 25% team, 15% private
insert into public.projects (id, name, privacy, team_id, created_by, owner_id)
select gen_random_uuid(), 'Load project ' || i,
       (case when i % 20 < 12 then 'public' when i % 20 < 17 then 'team' else 'private' end)::public.project_privacy,
       (select id from public.teams where name = 'Team ' || (1 + i % 20)),
       p.id, p.id
from generate_series(1, 300) i join people p on p.n = 1 + (i * 7) % 500;

create temp table lp as select id, row_number() over () as k from public.projects where name like 'Load project %';
insert into public.project_members (project_id, user_id, role)
select lp.id, p.id, 'editor' from lp join people p on (p.n + lp.k) % 50 = 0 on conflict do nothing;

-- 60,000 tasks (200 per project, 20% with a subtask) and their sections
set local seeds.silent = 'on';
insert into public.tasks (project_id, section_id, name, assignee_id, due_date, completed, position, created_by)
select lp.id,
       (select s.id from public.sections s where s.project_id = lp.id order by position limit 1),
       'Load task ' || lp.k || '-' || i,
       (select id from people where n = 1 + (lp.k * 31 + i) % 500),
       current_date + (i % 60) - 20,
       i % 3 = 0,
       i * 1000,
       (select id from people where n = 1 + (lp.k * 7) % 500)
from lp, generate_series(1, 200) i;

insert into public.tasks (parent_id, name, created_by, position)
select t.id, 'Sub of ' || t.name, t.created_by, 1000 from public.tasks t where t.name like 'Load task %' and right(t.name, 1) = '5';

-- 100,000 comments and 50,000 notifications
insert into public.comments (task_id, author_id, body)
select t.id, t.created_by, 'Load comment ' || g from (select id, created_by from public.tasks where name like 'Load task %' limit 50000) t, generate_series(1, 2) g;
insert into public.notifications (user_id, type, task_id, project_id)
select assignee_id, 'assigned', id, project_id from public.tasks where name like 'Load task %' and assignee_id is not null limit 50000;
reset seeds.silent;
analyze public.tasks, public.comments, public.notifications, public.projects, public.project_members, public.profiles, public.team_members, public.sections;

select format('%s profiles, %s projects, %s tasks, %s comments, %s notifications',
  (select count(*) from public.profiles), (select count(*) from public.projects), (select count(*) from public.tasks),
  (select count(*) from public.comments), (select count(*) from public.notifications)) as volume;

-- Act as an ordinary member with two-factor.
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true)
from people where n = 250;
set local role authenticated;
select id as busy_project from public.projects where name like 'Load project %' and privacy = 'public' order by name limit 1 \gset

\timing on
\echo '--- projects visible to me (sidebar / browse)'
select count(*) from public.projects;
\echo '--- one project''s list view (200 tasks + subtask/comment counts)'
select count(*) from (
  select t.id, (select count(*) from public.tasks s where s.parent_id = t.id), (select count(*) from public.comments c where c.task_id = t.id)
  from public.tasks t where t.project_id = :'busy_project' and t.parent_id is null) x;
\echo '--- my tasks'
select count(*) from public.tasks where assignee_id = (select auth.uid());
\echo '--- inbox (200 newest)'
select count(*) from (select * from public.notifications where user_id = (select auth.uid()) and archived_at is null order by created_at desc limit 200) x;
\echo '--- project progress for every visible project'
select count(*) from public.project_stats();
\echo '--- task search'
select count(*) from (select id from public.tasks where name ilike '%task 13-1%' limit 10) x;
\timing off

rollback;
