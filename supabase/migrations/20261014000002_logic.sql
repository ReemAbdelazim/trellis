-- =============================================================================
-- Seeds Tasks — business logic: sign-up gate, guards, activity, notifications,
-- rules automation, templates.
-- =============================================================================

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- True while internal bulk operations (e.g. duplicating a project) are running.
create or replace function public.is_silent()
returns boolean language sql stable as $$
  select coalesce(current_setting('seeds.silent', true), '') = 'on';
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
create trigger task_field_values_updated_at before update on public.task_field_values
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Sign-up gate: allowed domain → member, open invitation → invited role,
-- otherwise the sign-in is rejected. The very first allowed-domain user is admin.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_domain text := split_part(lower(coalesce(new.email, '')), '@', 2);
  v_domains text[];
  v_verified boolean;
  v_role public.user_role;
  v_invite public.invitations%rowtype;
begin
  select allowed_domains into v_domains from public.org_settings where id = 1;

  -- OAuth providers report email_verified in the identity claims. Email/password users can only
  -- be created by an admin (the email provider is disabled in production) and must still confirm.
  v_verified := new.email_confirmed_at is not null
    or coalesce((new.raw_user_meta_data ->> 'email_verified')::boolean, false)
    or coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email';

  if v_email = '' or not v_verified then
    raise exception 'SEEDS_NOT_AUTHORIZED: a verified email address is required';
  end if;

  select * into v_invite from public.invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc limit 1;

  if v_domain = any (select lower(d) from unnest(v_domains) d) then
    if not exists (select 1 from public.profiles where role = 'admin') then
      v_role := 'admin';
    elsif v_invite.id is not null and v_invite.role = 'admin' then
      v_role := 'admin';
    else
      v_role := 'member';
    end if;
  elsif v_invite.id is not null then
    v_role := v_invite.role;
  else
    raise exception 'SEEDS_NOT_AUTHORIZED: % is not a member of this workspace', v_email;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    v_email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(v_email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    v_role
  );

  if v_invite.id is not null then
    update public.invitations set accepted_at = now() where lower(email) = v_email and accepted_at is null;
    if v_invite.project_id is not null and private.can_edit_project(v_invite.project_id, v_invite.invited_by) then
      insert into public.project_members (project_id, user_id, role)
      values (v_invite.project_id, new.id, 'editor') on conflict do nothing;
    end if;
    if v_invite.team_id is not null and private.is_team_admin(v_invite.team_id, v_invite.invited_by) then
      insert into public.team_members (team_id, user_id) values (v_invite.team_id, new.id) on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep name / avatar fresh from the identity provider on each sign-in.
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p set
    avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', p.avatar_url),
    last_seen_at = case when new.last_sign_in_at is distinct from old.last_sign_in_at then now() else p.last_seen_at end
  where p.id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.handle_user_updated();

-- =============================================================================
-- Guards
-- =============================================================================
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;

  if (new.role is distinct from old.role or new.status is distinct from old.status) then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only admins can change roles or account status';
    end if;
    if old.role = 'admin' and old.status = 'active'
       and (new.role <> 'admin' or new.status <> 'active')
       and not exists (select 1 from public.profiles where role = 'admin' and status = 'active' and id <> old.id) then
      raise exception 'The workspace must keep at least one active admin';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.guard_project_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Fixed after creation; only cleared when the person's account is deleted.
  if auth.uid() is not null or new.created_by is not null then new.created_by := old.created_by; end if;
  if auth.uid() is not null
     and (new.privacy is distinct from old.privacy or new.owner_id is distinct from old.owner_id or new.team_id is distinct from old.team_id)
     and coalesce(public.project_access(old.id), '') <> 'owner' then
    raise exception 'Only project owners can change privacy, owner, or team';
  end if;
  return new;
end;
$$;

create trigger projects_guard before update on public.projects
  for each row execute function public.guard_project_update();

create or replace function public.before_team_insert()
returns trigger language plpgsql as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

create trigger teams_before_insert before insert on public.teams
  for each row execute function public.before_team_insert();

create or replace function public.after_team_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.team_members (team_id, user_id, is_admin) values (new.id, new.created_by, true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger teams_after_insert after insert on public.teams
  for each row execute function public.after_team_insert();

create or replace function public.before_invitation_insert()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  new.invited_by := coalesce(new.invited_by, auth.uid());
  return new;
end;
$$;

create trigger invitations_before_insert before insert on public.invitations
  for each row execute function public.before_invitation_insert();

-- =============================================================================
-- Projects: owner membership + default sections
-- =============================================================================
create or replace function public.after_project_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := coalesce(new.owner_id, new.created_by);
begin
  if v_owner is not null then
    insert into public.project_members (project_id, user_id, role) values (new.id, v_owner, 'owner')
    on conflict (project_id, user_id) do update set role = 'owner';
  end if;
  if not public.is_silent() then
    insert into public.sections (project_id, name, position) values
      (new.id, 'To do', 1000), (new.id, 'In progress', 2000), (new.id, 'Done', 3000);
  end if;
  return new;
end;
$$;

create trigger projects_after_insert after insert on public.projects
  for each row execute function public.after_project_insert();

create or replace function public.before_project_insert()
returns trigger language plpgsql as $$
begin
  new.owner_id := coalesce(new.owner_id, new.created_by, auth.uid());
  return new;
end;
$$;

create trigger projects_before_insert before insert on public.projects
  for each row execute function public.before_project_insert();

-- =============================================================================
-- Notifications helper
-- =============================================================================
create or replace function private.notify(
  p_user uuid, p_type text, p_task uuid default null, p_project uuid default null,
  p_comment uuid default null, p_data jsonb default '{}', p_goal uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or public.is_silent() then return; end if;
  if p_user = auth.uid() then return; end if;
  if not private.is_active(p_user) then return; end if;
  if p_task is not null and not private.can_view_task(p_task, p_user) then return; end if;
  if p_task is null and p_project is not null and not private.can_view_project(p_project, p_user) then return; end if;

  insert into public.notifications (user_id, actor_id, type, task_id, project_id, comment_id, goal_id, data)
  values (p_user, auth.uid(), p_type, p_task, p_project, p_comment, p_goal, coalesce(p_data, '{}'));
end;
$$;

create or replace function private.log_activity(p_task uuid, p_kind text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_rule text := nullif(current_setting('seeds.rule', true), '');
begin
  if public.is_silent() then return; end if;
  insert into public.task_activity (task_id, actor_id, kind, data)
  values (p_task, auth.uid(), p_kind,
          case when v_rule is null then coalesce(p_data, '{}') else coalesce(p_data, '{}') || jsonb_build_object('rule', v_rule) end);
end;
$$;

-- =============================================================================
-- Tasks
-- =============================================================================
create or replace function public.before_task_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent public.tasks%rowtype;
  v_cursor uuid;
  v_depth int;
begin
  if tg_op = 'UPDATE' then
    -- Fixed after creation; only cleared when the person's account is deleted.
    if auth.uid() is not null or new.created_by is not null then new.created_by := old.created_by; end if;
    new.created_at := old.created_at;
    new.updated_at := now();
  else
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  -- Subtasks inherit their parent's project and never sit in a section.
  if new.parent_id is not null then
    if tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id then
      if auth.uid() is not null and not private.can_edit_task(new.parent_id, auth.uid()) then
        raise exception 'You do not have edit access to that parent task';
      end if;
      -- Walk up from the new parent: reject cycles and over-deep nesting.
      v_cursor := new.parent_id;
      v_depth := 1;
      while v_cursor is not null loop
        if v_cursor = new.id then raise exception 'A task cannot be nested inside itself'; end if;
        v_depth := v_depth + 1;
        if v_depth > 10 then raise exception 'Subtasks can be nested at most 10 levels deep'; end if;
        select parent_id into v_cursor from public.tasks where id = v_cursor;
      end loop;
    end if;
    select * into v_parent from public.tasks where id = new.parent_id;
    new.project_id := v_parent.project_id;
    new.section_id := null;
  end if;

  -- Project moves (directly or by re-parenting) require edit rights on both sides.
  -- The cascade that moves subtasks along with their parent runs a trigger level deeper.
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id and auth.uid() is not null
     and pg_trigger_depth() = 1 then
    if new.project_id is not null and not public.can_edit_project(new.project_id) then
      raise exception 'You do not have edit access to the destination project';
    end if;
    if old.project_id is not null and not public.can_edit_project(old.project_id) then
      raise exception 'You do not have edit access to the source project';
    end if;
  end if;

  -- Section must belong to the task's project; default to the first section.
  if new.parent_id is null then
    if new.project_id is null then
      new.section_id := null;
    elsif new.section_id is null
       or not exists (select 1 from public.sections s where s.id = new.section_id and s.project_id = new.project_id) then
      select id into new.section_id from public.sections where project_id = new.project_id order by position limit 1;
    end if;
  end if;

  -- Unpositioned tasks go to the end of their list, with small numbers so
  -- fractional reordering keeps plenty of precision.
  if new.position = 0 and tg_op = 'INSERT' then
    select coalesce(max(position), 0) + 1000 into new.position
    from public.tasks
    where project_id is not distinct from new.project_id
      and section_id is not distinct from new.section_id
      and parent_id is not distinct from new.parent_id
      and (new.project_id is not null or new.parent_id is not null or created_by = new.created_by);
  end if;

  -- Completion bookkeeping
  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif not new.completed then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.assignee_id is distinct from (case when tg_op = 'UPDATE' then old.assignee_id end) then
    new.my_tasks_bucket := 'recently_assigned';
    new.my_tasks_position := 0;
  end if;

  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.before_task_write();

create or replace function public.after_task_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.task_followers (task_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  end if;
  if new.assignee_id is not null then
    insert into public.task_followers (task_id, user_id) values (new.id, new.assignee_id) on conflict do nothing;
    perform private.notify(new.assignee_id, 'assigned', new.id, new.project_id);
  end if;

  perform private.log_activity(new.id, 'created', '{}');
  perform private.run_rules(new, null, 'insert');
  return null;
end;
$$;

create trigger tasks_after_insert after insert on public.tasks
  for each row execute function public.after_task_insert();

create or replace function public.after_task_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  if new.name is distinct from old.name and old.name <> '' then
    perform private.log_activity(new.id, 'renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;

  if new.description is distinct from old.description then
    perform private.log_activity(new.id, 'description_changed', '{}');
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform private.log_activity(new.id, case when new.assignee_id is null then 'unassigned' else 'assigned' end,
      jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    if new.assignee_id is not null then
      insert into public.task_followers (task_id, user_id) values (new.id, new.assignee_id) on conflict do nothing;
      perform private.notify(new.assignee_id, 'assigned', new.id, new.project_id);
    end if;
  end if;

  if new.due_date is distinct from old.due_date then
    perform private.log_activity(new.id, 'due_changed', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;

  if new.start_date is distinct from old.start_date then
    perform private.log_activity(new.id, 'start_changed', jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;

  if new.completed is distinct from old.completed then
    perform private.log_activity(new.id, case when new.completed then 'completed' else 'reopened' end, '{}');
    if new.completed then
      for f in select user_id from public.task_followers where task_id = new.id loop
        perform private.notify(f.user_id, 'completed', new.id, new.project_id);
      end loop;
    end if;
  end if;

  if new.section_id is distinct from old.section_id and new.project_id is not distinct from old.project_id and new.parent_id is null then
    perform private.log_activity(new.id, 'moved_section', jsonb_build_object(
      'from', (select name from public.sections where id = old.section_id),
      'to', (select name from public.sections where id = new.section_id)));
  end if;

  if new.project_id is distinct from old.project_id then
    perform private.log_activity(new.id, 'moved_project', jsonb_build_object(
      'from', (select name from public.projects where id = old.project_id),
      'to', (select name from public.projects where id = new.project_id)));
    -- subtasks follow their parent
    update public.tasks set project_id = new.project_id where parent_id = new.id and project_id is distinct from new.project_id;
  end if;

  perform private.run_rules(new, old, 'update');
  return null;
end;
$$;

create trigger tasks_after_update after update on public.tasks
  for each row execute function public.after_task_update();

-- Dependencies: reject cycles.
create or replace function public.guard_task_dependency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    with recursive chain(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'That dependency would create a cycle';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_guard before insert on public.task_dependencies
  for each row execute function public.guard_task_dependency();

-- =============================================================================
-- Comments
-- =============================================================================
create or replace function public.after_comment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  f record;
  m uuid;
begin
  select * into v_task from public.tasks where id = new.task_id;

  if new.author_id is not null then
    insert into public.task_followers (task_id, user_id) values (new.task_id, new.author_id) on conflict do nothing;
  end if;

  for m in select distinct x from unnest(new.mentions) x limit 25 loop
    perform private.notify(m, 'mentioned', new.task_id, v_task.project_id, new.id,
      jsonb_build_object('excerpt', left(new.body, 200)));
    if private.can_view_task(new.task_id, m) then
      insert into public.task_followers (task_id, user_id) values (new.task_id, m) on conflict do nothing;
    end if;
  end loop;

  for f in select user_id from public.task_followers
           where task_id = new.task_id and user_id <> all (new.mentions) loop
    perform private.notify(f.user_id, 'commented', new.task_id, v_task.project_id, new.id,
      jsonb_build_object('excerpt', left(new.body, 200)));
  end loop;

  return null;
end;
$$;

create trigger comments_after_insert after insert on public.comments
  for each row execute function public.after_comment_insert();

create or replace function public.before_comment_update()
returns trigger language plpgsql as $$
begin
  new.task_id := old.task_id;
  -- Fixed after creation; only cleared when the person's account is deleted.
  if auth.uid() is not null or new.author_id is not null then new.author_id := old.author_id; end if;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$$;

create trigger comments_before_update before update on public.comments
  for each row execute function public.before_comment_update();

create or replace function public.after_attachment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.log_activity(new.task_id, 'attached', jsonb_build_object('file_name', new.file_name));
  return null;
end;
$$;

create trigger attachments_after_insert after insert on public.attachments
  for each row execute function public.after_attachment_insert();

-- =============================================================================
-- Project membership & status updates
-- =============================================================================
create or replace function public.after_project_member_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(new.user_id, 'added_to_project', null, new.project_id, null,
    jsonb_build_object('role', new.role));
  return null;
end;
$$;

create trigger project_members_after_insert after insert on public.project_members
  for each row execute function public.after_project_member_insert();

create or replace function public.after_status_update_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  update public.projects set current_status = new.status where id = new.project_id;
  for m in select user_id from public.project_members where project_id = new.project_id loop
    perform private.notify(m.user_id, 'status_update', null, new.project_id, null,
      jsonb_build_object('status', new.status, 'title', new.title));
  end loop;
  return null;
end;
$$;

create trigger psu_after_insert after insert on public.project_status_updates
  for each row execute function public.after_status_update_insert();

create or replace function public.after_goal_status_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  update public.goals set status = new.status where id = new.goal_id returning owner_id into v_owner;
  perform private.notify(v_owner, 'goal_update', null, null, null, jsonb_build_object('status', new.status), new.goal_id);
  return null;
end;
$$;

create trigger gsu_after_insert after insert on public.goal_status_updates
  for each row execute function public.after_goal_status_insert();

-- =============================================================================
-- Ownership guards
-- =============================================================================

-- Rules act with their author's identity (e.g. "add comment"), so the author is
-- always whoever last saved the rule.
create or replace function public.before_rule_write()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger rules_before_write before insert or update on public.rules
  for each row execute function public.before_rule_write();

-- Sections and custom fields can't be moved between projects.
create or replace function public.keep_project_id()
returns trigger language plpgsql as $$
begin
  new.project_id := old.project_id;
  return new;
end;
$$;

create trigger sections_keep_project before update on public.sections
  for each row execute function public.keep_project_id();
create trigger custom_fields_keep_project before update on public.custom_fields
  for each row execute function public.keep_project_id();

-- Any member may edit a goal, but authorship is fixed and only the owner,
-- the author or an admin can hand ownership to someone else.
create or replace function public.guard_goal_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  -- Fixed after creation; only cleared when the person's account is deleted.
  if auth.uid() is not null or new.created_by is not null then new.created_by := old.created_by; end if;
  new.created_at := old.created_at;
  if new.owner_id is distinct from old.owner_id and auth.uid() is not null
     and auth.uid() is distinct from old.owner_id and auth.uid() is distinct from old.created_by
     and not private.is_admin(auth.uid()) then
    raise exception 'Only the goal owner can change who owns it';
  end if;
  return new;
end;
$$;

create trigger goals_guard before insert or update on public.goals
  for each row execute function public.guard_goal_write();

create or replace function public.guard_portfolio_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := old.created_at;
  if new.owner_id is distinct from old.owner_id and auth.uid() is not null
     and auth.uid() is distinct from old.owner_id and not private.is_admin(auth.uid()) then
    raise exception 'Only the portfolio owner can transfer it';
  end if;
  return new;
end;
$$;

create trigger portfolios_guard before update on public.portfolios
  for each row execute function public.guard_portfolio_update();

-- Membership rows can change role, never which project/team or person they're for.
create or replace function public.guard_project_member_update()
returns trigger language plpgsql as $$
begin
  new.project_id := old.project_id;
  new.user_id := old.user_id;
  return new;
end;
$$;

create trigger project_members_guard before update on public.project_members
  for each row execute function public.guard_project_member_update();

create or replace function public.guard_team_member_update()
returns trigger language plpgsql as $$
begin
  new.team_id := old.team_id;
  new.user_id := old.user_id;
  return new;
end;
$$;

create trigger team_members_guard before update on public.team_members
  for each row execute function public.guard_team_member_update();

-- =============================================================================
-- Rules automation
-- =============================================================================
create or replace function private.run_rules(
  p_task public.tasks, p_old public.tasks, p_event text,
  p_field uuid default null, p_value jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.rules%rowtype;
  a jsonb;
  matched boolean;
  v_opt text;
begin
  if p_task.project_id is null or p_task.parent_id is not null or public.is_silent() then return; end if;
  -- Changes made by a rule never trigger further rules (no chains, no loops).
  if coalesce(current_setting('seeds.rule', true), '') <> '' then return; end if;

  for r in select * from public.rules where project_id = p_task.project_id and enabled order by created_at loop
    v_opt := r.trigger_config ->> 'option_id';
    matched := coalesce(case r.trigger_type
      when 'task_added' then
        p_event = 'insert'
        and (r.trigger_config ->> 'section_id' is null or p_task.section_id::text = r.trigger_config ->> 'section_id')
      when 'section_changed' then
        p_event = 'update' and p_task.section_id is distinct from p_old.section_id
        and (r.trigger_config ->> 'section_id' is null or p_task.section_id::text = r.trigger_config ->> 'section_id')
      when 'completed' then
        p_event in ('insert', 'update') and p_task.completed and (p_event = 'insert' or not p_old.completed)
      when 'assignee_changed' then
        p_event in ('insert', 'update') and p_task.assignee_id is not null
        and (p_event = 'insert' or p_task.assignee_id is distinct from p_old.assignee_id)
        and (r.trigger_config ->> 'user_id' is null or p_task.assignee_id::text = r.trigger_config ->> 'user_id')
      when 'due_date_changed' then
        p_event = 'update' and p_task.due_date is distinct from p_old.due_date
      when 'field_changed' then
        p_event = 'field' and p_field::text = r.trigger_config ->> 'field_id'
        and (v_opt is null or p_value = to_jsonb(v_opt)
             or (jsonb_typeof(p_value) = 'array' and p_value @> jsonb_build_array(v_opt)))
      else false
    end, false);

    if matched then
      perform set_config('seeds.rule', r.name, true);
      for a in select * from jsonb_array_elements(r.actions) loop
        case a ->> 'type'
          when 'move_to_section' then
            update public.tasks set section_id = public.try_uuid(a ->> 'section_id')
            where id = p_task.id and section_id is distinct from public.try_uuid(a ->> 'section_id')
              and exists (select 1 from public.sections s where s.id = public.try_uuid(a ->> 'section_id') and s.project_id = p_task.project_id);
          when 'set_complete' then
            update public.tasks set completed = coalesce((a ->> 'value')::boolean, true)
            where id = p_task.id and completed is distinct from coalesce((a ->> 'value')::boolean, true);
          when 'set_assignee' then
            update public.tasks set assignee_id = public.try_uuid(a ->> 'user_id')
            where id = p_task.id and assignee_id is distinct from public.try_uuid(a ->> 'user_id');
          when 'set_due_in_days' then
            update public.tasks set due_date = current_date + coalesce((a ->> 'days')::int, 0),
              start_date = case when start_date > current_date + coalesce((a ->> 'days')::int, 0) then null else start_date end
            where id = p_task.id;
          when 'add_follower' then
            insert into public.task_followers (task_id, user_id)
            select p_task.id, public.try_uuid(a ->> 'user_id')
            where public.try_uuid(a ->> 'user_id') is not null
            on conflict do nothing;
          when 'add_comment' then
            insert into public.comments (task_id, author_id, body)
            values (p_task.id, r.created_by, coalesce(nullif(a ->> 'body', ''), 'Automated comment'));
          when 'set_field' then
            insert into public.task_field_values (task_id, field_id, value)
            select p_task.id, f.id, a -> 'value' from public.custom_fields f
            where f.id = public.try_uuid(a ->> 'field_id') and f.project_id = p_task.project_id
            on conflict (task_id, field_id) do update set value = excluded.value;
          else
            null;
        end case;
      end loop;
      perform set_config('seeds.rule', '', true);
    end if;
  end loop;
end;
$$;

create or replace function public.after_field_value_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then return null; end if;
  select * into v_task from public.tasks where id = new.task_id;
  perform private.log_activity(new.task_id, 'field_changed', jsonb_build_object(
    'field', (select name from public.custom_fields where id = new.field_id), 'field_id', new.field_id));
  perform private.run_rules(v_task, null, 'field', new.field_id, new.value);
  return null;
end;
$$;

create trigger task_field_values_after_write after insert or update on public.task_field_values
  for each row execute function public.after_field_value_write();

-- =============================================================================
-- Templates / duplication
-- =============================================================================
create or replace function public.duplicate_project(
  p_project uuid, p_name text, p_include_tasks boolean default true, p_as_template boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_new uuid;
  v_id uuid;
  v_smap jsonb := '{}';
  v_fmap jsonb := '{}';
  v_tmap jsonb := '{}';
  v_text text;
  s record;
  t record;
  k text;
begin
  if not public.is_full_member() or not public.can_view_project(p_project) then
    raise exception 'You do not have access to that project';
  end if;

  perform set_config('seeds.silent', 'on', true);

  insert into public.projects (team_id, name, description, color, icon, privacy, owner_id, default_view, is_template, created_by)
  select team_id, coalesce(nullif(trim(p_name), ''), name || ' (copy)'), description, color, icon, privacy,
         auth.uid(), default_view, p_as_template, auth.uid()
  from public.projects where id = p_project
  returning id into v_new;

  for s in select * from public.sections where project_id = p_project order by position loop
    insert into public.sections (project_id, name, position) values (v_new, s.name, s.position) returning id into v_id;
    v_smap := v_smap || jsonb_build_object(s.id::text, v_id);
  end loop;

  for s in select * from public.custom_fields where project_id = p_project order by position loop
    insert into public.custom_fields (project_id, name, type, config, position)
    values (v_new, s.name, s.type, s.config, s.position) returning id into v_id;
    v_fmap := v_fmap || jsonb_build_object(s.id::text, v_id);
  end loop;

  if p_include_tasks then
    for t in
      with recursive tree as (
        select tk.*, 0 as depth from public.tasks tk where tk.project_id = p_project and tk.parent_id is null
        union all
        select c.*, tree.depth + 1 from public.tasks c join tree on c.parent_id = tree.id
      )
      select * from tree order by depth, position
    loop
      insert into public.tasks (project_id, section_id, parent_id, name, description, is_milestone, estimate_hours, position, created_by)
      values (
        v_new,
        public.try_uuid(v_smap ->> t.section_id::text),
        public.try_uuid(v_tmap ->> t.parent_id::text),
        t.name, t.description, t.is_milestone, t.estimate_hours, t.position, auth.uid()
      ) returning id into v_id;
      v_tmap := v_tmap || jsonb_build_object(t.id::text, v_id);
    end loop;

    insert into public.task_field_values (task_id, field_id, value)
    select public.try_uuid(v_tmap ->> v.task_id::text), public.try_uuid(v_fmap ->> v.field_id::text), v.value
    from public.task_field_values v
    join public.tasks tk on tk.id = v.task_id and tk.project_id = p_project
    where v_tmap ? v.task_id::text and v_fmap ? v.field_id::text;

    insert into public.task_dependencies (task_id, depends_on_id)
    select public.try_uuid(v_tmap ->> d.task_id::text), public.try_uuid(v_tmap ->> d.depends_on_id::text)
    from public.task_dependencies d
    where v_tmap ? d.task_id::text and v_tmap ? d.depends_on_id::text;
  end if;

  -- Rules: remap section and field ids inside their JSON.
  for s in select * from public.rules where project_id = p_project loop
    v_text := s.trigger_config::text || '|||' || s.actions::text;
    for k in select jsonb_object_keys(v_smap) loop
      v_text := replace(v_text, k, v_smap ->> k);
    end loop;
    for k in select jsonb_object_keys(v_fmap) loop
      v_text := replace(v_text, k, v_fmap ->> k);
    end loop;
    insert into public.rules (project_id, name, enabled, trigger_type, trigger_config, actions, created_by)
    values (v_new, s.name, s.enabled, s.trigger_type,
            split_part(v_text, '|||', 1)::jsonb, split_part(v_text, '|||', 2)::jsonb, auth.uid());
  end loop;

  perform set_config('seeds.silent', '', true);
  return v_new;
end;
$$;

-- =============================================================================
-- Lock down internal functions (not callable through the API)
-- =============================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_updated() from public, anon, authenticated;
revoke execute on function private.notify(uuid, text, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function private.log_activity(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.run_rules(public.tasks, public.tasks, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.duplicate_project(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.duplicate_project(uuid, text, boolean, boolean) to authenticated;
