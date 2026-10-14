-- =============================================================================
-- Seeds Tasks — core schema
-- Tables, access helpers, and row level security.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'member', 'guest');
create type public.user_status as enum ('active', 'deactivated');
create type public.project_privacy as enum ('public', 'team', 'private');
create type public.project_role as enum ('owner', 'editor', 'commenter', 'viewer');
create type public.status_color as enum ('on_track', 'at_risk', 'off_track', 'on_hold', 'complete');
create type public.field_type as enum ('text', 'number', 'single_select', 'multi_select', 'date', 'people', 'checkbox');

-- ---------------------------------------------------------------------------
-- Organization
-- ---------------------------------------------------------------------------
create table public.org_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Seeds of Leadership',
  allowed_domains text[] not null default array['seedsofleadership.ca'],
  allow_member_invites boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.org_settings (id) values (1);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  avatar_url text,
  title text,
  role public.user_role not null default 'member',
  status public.user_status not null default 'active',
  email_notifications boolean not null default true,
  timezone text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.user_role not null default 'guest',
  invited_by uuid references public.profiles (id) on delete set null,
  project_id uuid,
  team_id uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invitations_email_open_idx on public.invitations (lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Teams & projects
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  color text not null default 'teal',
  created_by uuid references public.profiles (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete set null,
  name text not null,
  description text not null default '',
  color text not null default 'teal',
  icon text not null default 'list',
  privacy public.project_privacy not null default 'public',
  owner_id uuid references public.profiles (id) on delete set null,
  default_view text not null default 'list',
  start_date date,
  due_date date,
  current_status public.status_color,
  archived boolean not null default false,
  is_template boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_team_idx on public.projects (team_id);

alter table public.invitations
  add constraint invitations_project_fk foreign key (project_id) references public.projects (id) on delete cascade,
  add constraint invitations_team_fk foreign key (team_id) references public.teams (id) on delete cascade;

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position double precision not null default 0,
  primary key (user_id, project_id)
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index sections_project_idx on public.sections (project_id, position);

create table public.project_status_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  status public.status_color not null,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);
create index project_status_updates_project_idx on public.project_status_updates (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  parent_id uuid references public.tasks (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  assignee_id uuid references public.profiles (id) on delete set null,
  start_date date,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  is_milestone boolean not null default false,
  estimate_hours numeric(8, 2),
  position double precision not null default 0,
  my_tasks_bucket text not null default 'recently_assigned'
    check (my_tasks_bucket in ('recently_assigned', 'today', 'upcoming', 'later')),
  my_tasks_position double precision not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored,
  constraint tasks_dates_ok check (start_date is null or due_date is null or start_date <= due_date)
);
create index tasks_project_idx on public.tasks (project_id, section_id, position) where parent_id is null;
create index tasks_parent_idx on public.tasks (parent_id, position);
create index tasks_assignee_idx on public.tasks (assignee_id, completed);
create index tasks_due_idx on public.tasks (due_date) where completed = false;
create index tasks_search_idx on public.tasks using gin (search);
create index tasks_name_trgm_idx on public.tasks using gin (name extensions.gin_trgm_ops);

create table public.task_followers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, user_id)
);
create index task_followers_user_idx on public.task_followers (user_id);

create table public.task_likes (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  primary key (task_id, user_id)
);

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,      -- blocked task
  depends_on_id uuid not null references public.tasks (id) on delete cascade, -- blocking task
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);
create index task_dependencies_depends_idx on public.task_dependencies (depends_on_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'gray',
  created_at timestamptz not null default now()
);
create unique index tags_name_idx on public.tags (lower(name));

create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (length(body) between 1 and 20000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 50),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_task_idx on public.comments (task_id, created_at);

create table public.task_activity (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index task_activity_task_idx on public.task_activity (task_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploader_id uuid references public.profiles (id) on delete set null default auth.uid(),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index attachments_task_idx on public.attachments (task_id);

-- ---------------------------------------------------------------------------
-- Custom fields & rules
-- ---------------------------------------------------------------------------
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  type public.field_type not null,
  -- select types: {"options": [{"id": "...", "name": "...", "color": "..."}]}
  -- number: {"precision": 0, "unit": "$"}
  config jsonb not null default '{}',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index custom_fields_project_idx on public.custom_fields (project_id, position);

create table public.task_field_values (
  task_id uuid not null references public.tasks (id) on delete cascade,
  field_id uuid not null references public.custom_fields (id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (task_id, field_id)
);
create index task_field_values_field_idx on public.task_field_values (field_id);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  -- task_added | section_changed | completed | assignee_changed | due_date_changed | field_changed
  trigger_type text not null check (trigger_type in
    ('task_added', 'section_changed', 'completed', 'assignee_changed', 'due_date_changed', 'field_changed')),
  -- {"section_id": "..."} / {"field_id": "...", "option_id": "..."}
  trigger_config jsonb not null default '{}',
  -- [{"type": "move_to_section", "section_id": "..."}, {"type": "set_complete", "value": true}, ...]
  actions jsonb not null default '[]' check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 10),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index rules_project_idx on public.rules (project_id) where enabled;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  -- assigned | mentioned | commented | completed | due_soon | added_to_project | status_update | goal_update
  type text not null,
  task_id uuid references public.tasks (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  goal_id uuid,
  comment_id uuid references public.comments (id) on delete cascade,
  data jsonb not null default '{}',
  read_at timestamptz,
  archived_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, archived_at, created_at desc);
create index notifications_email_idx on public.notifications (created_at) where emailed_at is null;

-- ---------------------------------------------------------------------------
-- Goals & portfolios
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid references public.profiles (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  parent_id uuid references public.goals (id) on delete set null,
  time_period text not null default '',
  start_date date,
  due_date date,
  status public.status_color,
  -- manual | subgoals | projects
  progress_source text not null default 'manual' check (progress_source in ('manual', 'subgoals', 'projects')),
  metric_unit text not null default 'percent' check (metric_unit in ('percent', 'number', 'currency')),
  metric_start numeric not null default 0,
  metric_current numeric not null default 0,
  metric_target numeric not null default 100,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_parent_idx on public.goals (parent_id);

alter table public.notifications
  add constraint notifications_goal_fk foreign key (goal_id) references public.goals (id) on delete cascade;

create table public.goal_projects (
  goal_id uuid not null references public.goals (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (goal_id, project_id)
);

create table public.goal_status_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  status public.status_color not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'teal',
  owner_id uuid references public.profiles (id) on delete set null default auth.uid(),
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.portfolio_members (
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  can_edit boolean not null default true,
  primary key (portfolio_id, user_id)
);

create table public.portfolio_projects (
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position double precision not null default 0,
  primary key (portfolio_id, project_id)
);

-- =============================================================================
-- Access helpers
--
-- private.*  take an explicit user id. Only trigger code and other
--            security-definer functions can call them (the schema has no API access).
-- public.*   are wrappers used by RLS policies and the client. They always
--            evaluate for the calling user, so they can't be used to probe what
--            other people can see.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_active(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'active');
$$;

create or replace function private.is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'active' and role = 'admin');
$$;

-- Admins and members (not guests)
create or replace function private.is_full_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'active' and role in ('admin', 'member'));
$$;

create or replace function private.is_team_admin(p_team uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin(p_user)
    or (private.is_active(p_user) and (
      exists (select 1 from public.teams t where t.id = p_team and t.created_by = p_user)
      or exists (select 1 from public.team_members tm where tm.team_id = p_team and tm.user_id = p_user and tm.is_admin)
    ));
$$;

-- Effective role on a project: owner | editor | commenter | viewer | null (no access)
create or replace function private.project_access(p_project uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_explicit public.project_role;
  v_project public.projects%rowtype;
begin
  select role into v_role from public.profiles where id = p_user and status = 'active';
  if v_role is null then return null; end if;

  select * into v_project from public.projects where id = p_project;
  if not found then return null; end if;

  if v_role = 'admin' then return 'owner'; end if;

  select role into v_explicit from public.project_members where project_id = p_project and user_id = p_user;
  if v_explicit is not null then return v_explicit::text; end if;

  if v_project.owner_id = p_user or v_project.created_by = p_user then return 'owner'; end if;

  if v_role = 'member' and (
    v_project.privacy = 'public'
    -- A team project whose team was removed falls back to explicit members only.
    or (v_project.privacy = 'team' and v_project.team_id is not null
        and exists (select 1 from public.team_members tm where tm.team_id = v_project.team_id and tm.user_id = p_user))
  ) then
    return 'editor';
  end if;

  return null;
end;
$$;

create or replace function private.can_view_project(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.project_access(p_project, p_user) is not null;
$$;

create or replace function private.can_edit_project(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.project_access(p_project, p_user) in ('owner', 'editor'), false);
$$;

-- Walks up the subtask chain. Chains are capped by the tasks trigger, and the
-- loop bound means a corrupted chain can never recurse forever.
create or replace function private.can_view_task(p_task uuid, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  t public.tasks%rowtype;
  v_id uuid := p_task;
begin
  if not private.is_active(p_user) then return false; end if;
  for i in 1..12 loop
    select * into t from public.tasks where id = v_id;
    if not found then return false; end if;
    if t.created_by = p_user or t.assignee_id = p_user then return true; end if;
    if t.project_id is not null and private.can_view_project(t.project_id, p_user) then return true; end if;
    if exists (select 1 from public.task_followers f where f.task_id = t.id and f.user_id = p_user) then return true; end if;
    if t.parent_id is null then return false; end if;
    v_id := t.parent_id;
  end loop;
  return false;
end;
$$;

create or replace function private.can_edit_task(p_task uuid, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  t public.tasks%rowtype;
  v_id uuid := p_task;
begin
  if not private.is_active(p_user) then return false; end if;
  for i in 1..12 loop
    select * into t from public.tasks where id = v_id;
    if not found then return false; end if;
    if t.created_by = p_user or t.assignee_id = p_user then return true; end if;
    if t.project_id is not null and private.can_edit_project(t.project_id, p_user) then return true; end if;
    if t.parent_id is null then return false; end if;
    v_id := t.parent_id;
  end loop;
  return false;
end;
$$;

create or replace function private.can_comment_task(p_task uuid, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_project uuid;
begin
  if private.can_edit_task(p_task, p_user) then return true; end if;
  if not private.can_view_task(p_task, p_user) then return false; end if;
  select project_id into v_project from public.tasks where id = p_task;
  return v_project is null or coalesce(private.project_access(v_project, p_user), 'commenter') <> 'viewer';
end;
$$;

-- Guests only see people they share a project with.
create or replace function private.can_see_profile(p_profile uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active(p_user) and (
    p_profile = p_user
    or private.is_full_member(p_user)
    or exists (
      select 1 from public.project_members a
      join public.project_members b on a.project_id = b.project_id
      where a.user_id = p_user and b.user_id = p_profile
    )
    or exists (
      select 1 from public.project_members a
      join public.projects p on p.id = a.project_id
      where a.user_id = p_user and p_profile in (p.owner_id, p.created_by)
    )
  );
$$;

create or replace function private.can_view_portfolio(p_portfolio uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_full_member(p_user) and exists (
    select 1 from public.portfolios p
    where p.id = p_portfolio and (
      not p.is_private or p.owner_id = p_user or private.is_admin(p_user)
      or exists (select 1 from public.portfolio_members m where m.portfolio_id = p.id and m.user_id = p_user)
    )
  );
$$;

create or replace function private.can_edit_portfolio(p_portfolio uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_full_member(p_user) and exists (
    select 1 from public.portfolios p
    where p.id = p_portfolio and (
      p.owner_id = p_user or private.is_admin(p_user)
      or exists (select 1 from public.portfolio_members m where m.portfolio_id = p.id and m.user_id = p_user and m.can_edit)
    )
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Public wrappers: always evaluated for the calling user.
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_active(auth.uid()); $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_admin(auth.uid()); $$;

create or replace function public.is_full_member() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_full_member(auth.uid()); $$;

create or replace function public.is_team_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_team_admin(p_team, auth.uid()); $$;

create or replace function public.project_access(p_project uuid) returns text
language sql stable security definer set search_path = '' as $$ select private.project_access(p_project, auth.uid()); $$;

create or replace function public.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_view_project(p_project, auth.uid()); $$;

create or replace function public.can_edit_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_edit_project(p_project, auth.uid()); $$;

create or replace function public.can_view_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_view_task(p_task, auth.uid()); $$;

create or replace function public.can_edit_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_edit_task(p_task, auth.uid()); $$;

create or replace function public.can_comment_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_comment_task(p_task, auth.uid()); $$;

create or replace function public.is_task_follower(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_followers where task_id = p_task and user_id = auth.uid());
$$;

create or replace function public.can_see_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_see_profile(p_profile, auth.uid()); $$;

create or replace function public.can_view_portfolio(p_portfolio uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_view_portfolio(p_portfolio, auth.uid()); $$;

create or replace function public.can_edit_portfolio(p_portfolio uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_edit_portfolio(p_portfolio, auth.uid()); $$;
-- =============================================================================
-- Row level security
-- =============================================================================

alter table public.org_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_favorites enable row level security;
alter table public.sections enable row level security;
alter table public.project_status_updates enable row level security;
alter table public.tasks enable row level security;
alter table public.task_followers enable row level security;
alter table public.task_likes enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.attachments enable row level security;
alter table public.custom_fields enable row level security;
alter table public.task_field_values enable row level security;
alter table public.rules enable row level security;
alter table public.notifications enable row level security;
alter table public.goals enable row level security;
alter table public.goal_projects enable row level security;
alter table public.goal_status_updates enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_members enable row level security;
alter table public.portfolio_projects enable row level security;

-- org_settings
create policy org_settings_select on public.org_settings for select to authenticated using (public.is_active());
create policy org_settings_update on public.org_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (public.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- invitations
create policy invitations_select on public.invitations for select to authenticated using (public.is_full_member());
create policy invitations_insert on public.invitations for insert to authenticated with check (
  invited_by = (select auth.uid())
  and (project_id is null or public.can_edit_project(project_id))
  and (team_id is null or public.is_team_admin(team_id))
  and (
    public.is_admin()
    or (role = 'guest' and public.is_full_member() and (select allow_member_invites from public.org_settings where id = 1))
  )
);
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_admin() or invited_by = auth.uid());

-- teams
create policy teams_select on public.teams for select to authenticated using (
  public.is_full_member() or exists (select 1 from public.team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid())
);
create policy teams_insert on public.teams for insert to authenticated with check (public.is_full_member());
create policy teams_update on public.teams for update to authenticated using (public.is_team_admin(id));
create policy teams_delete on public.teams for delete to authenticated using (public.is_admin() or created_by = auth.uid());

-- team_members
create policy team_members_select on public.team_members for select to authenticated using (public.is_active());
create policy team_members_insert on public.team_members for insert to authenticated with check (
  public.is_team_admin(team_id) or (user_id = (select auth.uid()) and public.is_full_member() and not is_admin)
);
create policy team_members_update on public.team_members for update to authenticated using (public.is_team_admin(team_id));
create policy team_members_delete on public.team_members for delete to authenticated using (
  user_id = auth.uid() or public.is_team_admin(team_id)
);

-- projects (row-based checks on creator so INSERT ... RETURNING works before membership exists)
create policy projects_select on public.projects for select to authenticated using (
  (public.is_active() and (created_by = auth.uid() or owner_id = auth.uid())) or public.can_view_project(id)
);
create policy projects_insert on public.projects for insert to authenticated with check (
  public.is_full_member() and created_by = auth.uid()
);
create policy projects_update on public.projects for update to authenticated using (public.can_edit_project(id));
create policy projects_delete on public.projects for delete to authenticated using (public.project_access(id) = 'owner');

-- project_members
create policy project_members_select on public.project_members for select to authenticated using (public.can_view_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated with check (
  public.project_access(project_id) = 'owner'
  or (public.can_edit_project(project_id) and role <> 'owner')
  or (user_id = auth.uid() and public.is_full_member() and public.can_view_project(project_id) and role <> 'owner')
);
create policy project_members_update on public.project_members for update to authenticated using (public.project_access(project_id) = 'owner');
create policy project_members_delete on public.project_members for delete to authenticated using (
  public.project_access(project_id) = 'owner'
  or (user_id = (select auth.uid()) and role = 'editor')
);

-- project_favorites
create policy project_favorites_all on public.project_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_project(project_id));

-- sections
create policy sections_select on public.sections for select to authenticated using (public.can_view_project(project_id));
create policy sections_write on public.sections for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

-- project_status_updates
create policy psu_select on public.project_status_updates for select to authenticated using (public.can_view_project(project_id));
create policy psu_insert on public.project_status_updates for insert to authenticated
  with check (author_id = auth.uid() and public.can_edit_project(project_id));
create policy psu_delete on public.project_status_updates for delete to authenticated
  using (author_id = auth.uid() or public.project_access(project_id) = 'owner');

-- tasks
create policy tasks_select on public.tasks for select to authenticated using (
  public.is_active() and (
    created_by = (select auth.uid())
    or assignee_id = (select auth.uid())
    or (project_id is not null and public.can_view_project(project_id))
    or public.is_task_follower(id)
    or (parent_id is not null and public.can_view_task(parent_id))
  )
);
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.is_active() and created_by = auth.uid() and (
    (parent_id is not null and public.can_edit_task(parent_id))
    or (parent_id is null and (project_id is null or public.can_edit_project(project_id)))
  )
);
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task(id))
  -- moving a task into another project is checked by the guard_task_update trigger
  with check (public.is_active());
create policy tasks_delete on public.tasks for delete to authenticated using (
  created_by = auth.uid() or (project_id is not null and public.can_edit_project(project_id))
  or (parent_id is not null and public.can_edit_task(parent_id))
);

-- task children
create policy task_followers_select on public.task_followers for select to authenticated using (public.can_view_task(task_id));
create policy task_followers_insert on public.task_followers for insert to authenticated with check (
  (user_id = auth.uid() and public.can_view_task(task_id)) or public.can_edit_task(task_id)
);
create policy task_followers_delete on public.task_followers for delete to authenticated using (
  user_id = auth.uid() or public.can_edit_task(task_id)
);

create policy task_likes_select on public.task_likes for select to authenticated using (public.can_view_task(task_id));
create policy task_likes_insert on public.task_likes for insert to authenticated with check (user_id = auth.uid() and public.can_view_task(task_id));
create policy task_likes_delete on public.task_likes for delete to authenticated using (user_id = auth.uid());

create policy task_deps_select on public.task_dependencies for select to authenticated using (public.can_view_task(task_id));
create policy task_deps_write on public.task_dependencies for all to authenticated
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id) and public.can_view_task(depends_on_id));

create policy tags_select on public.tags for select to authenticated using (public.is_active());
create policy tags_insert on public.tags for insert to authenticated with check (public.is_active());
create policy tags_update on public.tags for update to authenticated using (public.is_full_member());
create policy tags_delete on public.tags for delete to authenticated using (public.is_admin());

create policy task_tags_select on public.task_tags for select to authenticated using (public.can_view_task(task_id));
create policy task_tags_write on public.task_tags for all to authenticated
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id));

create policy comments_select on public.comments for select to authenticated using (public.can_view_task(task_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_comment_task(task_id));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create policy task_activity_select on public.task_activity for select to authenticated using (public.can_view_task(task_id));

create policy attachments_select on public.attachments for select to authenticated using (public.can_view_task(task_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploader_id = auth.uid() and public.can_comment_task(task_id));
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploader_id = auth.uid() or public.can_edit_task(task_id));

-- custom fields & rules
create policy custom_fields_select on public.custom_fields for select to authenticated using (public.can_view_project(project_id));
create policy custom_fields_write on public.custom_fields for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

create policy tfv_select on public.task_field_values for select to authenticated using (public.can_view_task(task_id));
create policy tfv_write on public.task_field_values for all to authenticated
  using (public.can_edit_task(task_id))
  with check (
    public.can_edit_task(task_id)
    and exists (
      select 1 from public.custom_fields f join public.tasks t on t.project_id = f.project_id
      where f.id = field_id and t.id = task_id
    )
  );

create policy rules_select on public.rules for select to authenticated using (public.can_view_project(project_id));
create policy rules_write on public.rules for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

-- notifications (inserted only by triggers / service role)
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at, archived_at) on public.notifications to authenticated;

-- goals (org-wide transparency for full members)
create policy goals_select on public.goals for select to authenticated using (public.is_full_member());
create policy goals_insert on public.goals for insert to authenticated with check (public.is_full_member() and created_by = auth.uid());
create policy goals_update on public.goals for update to authenticated using (public.is_full_member());
create policy goals_delete on public.goals for delete to authenticated
  using (public.is_admin() or created_by = auth.uid() or owner_id = auth.uid());

create policy goal_projects_select on public.goal_projects for select to authenticated using (public.is_full_member());
create policy goal_projects_write on public.goal_projects for all to authenticated
  using (public.is_full_member()) with check (public.is_full_member() and public.can_view_project(project_id));

create policy gsu_select on public.goal_status_updates for select to authenticated using (public.is_full_member());
create policy gsu_insert on public.goal_status_updates for insert to authenticated
  with check (public.is_full_member() and author_id = auth.uid());
create policy gsu_delete on public.goal_status_updates for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- portfolios
create policy portfolios_select on public.portfolios for select to authenticated using (
  (owner_id = auth.uid() and public.is_full_member()) or public.can_view_portfolio(id)
);
create policy portfolios_insert on public.portfolios for insert to authenticated with check (public.is_full_member() and owner_id = auth.uid());
create policy portfolios_update on public.portfolios for update to authenticated using (public.can_edit_portfolio(id));
create policy portfolios_delete on public.portfolios for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

create policy portfolio_members_select on public.portfolio_members for select to authenticated using (public.can_view_portfolio(portfolio_id));
create policy portfolio_members_write on public.portfolio_members for all to authenticated
  using (public.can_edit_portfolio(portfolio_id)) with check (public.can_edit_portfolio(portfolio_id));

create policy portfolio_projects_select on public.portfolio_projects for select to authenticated using (public.can_view_portfolio(portfolio_id));
create policy portfolio_projects_write on public.portfolio_projects for all to authenticated
  using (public.can_edit_portfolio(portfolio_id))
  with check (public.can_edit_portfolio(portfolio_id) and public.can_view_project(project_id));

-- =============================================================================
-- Reporting view (respects caller's RLS)
-- =============================================================================
create view public.project_stats with (security_invoker = true) as
select
  p.id as project_id,
  count(t.id) filter (where t.parent_id is null) as total_tasks,
  count(t.id) filter (where t.parent_id is null and t.completed) as completed_tasks,
  count(t.id) filter (where t.parent_id is null and not t.completed and t.due_date < current_date) as overdue_tasks,
  max(t.updated_at) as last_activity_at
from public.projects p
left join public.tasks t on t.project_id = p.id
group by p.id;
