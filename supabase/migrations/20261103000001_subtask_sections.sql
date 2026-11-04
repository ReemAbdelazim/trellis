-- =============================================================================
-- Subtask sections: a task's subtasks can be grouped under named sections, the
-- same way a project's tasks are. Each section belongs to exactly one project
-- or one task. Subtasks outside any section are listed first.
-- =============================================================================
alter table public.sections
  alter column project_id drop not null,
  add column task_id uuid references public.tasks (id) on delete cascade,
  add constraint sections_one_owner check (num_nonnulls(project_id, task_id) = 1);
create index sections_task_idx on public.sections (task_id, position) where task_id is not null;

drop policy sections_select on public.sections;
drop policy sections_write on public.sections;
create policy sections_select on public.sections for select to authenticated using (
  project_id = any ((select public.my_visible_project_ids())::uuid[])
  or (task_id is not null and public.can_view_task(task_id))
);
create policy sections_write on public.sections for all to authenticated
  using ((task_id is null and public.can_edit_project(project_id)) or (task_id is not null and public.can_edit_task(task_id)))
  with check ((task_id is null and public.can_edit_project(project_id)) or (task_id is not null and public.can_edit_task(task_id)));

-- A section never changes owner.
create or replace function public.keep_section_owner()
returns trigger language plpgsql as $$
begin
  new.project_id := old.project_id;
  new.task_id := old.task_id;
  return new;
end;
$$;
drop trigger sections_keep_project on public.sections;
create trigger sections_keep_owner before update on public.sections
  for each row execute function public.keep_section_owner();

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

  -- Subtasks inherit their parent's project; their section is one of the parent's own.
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
    if new.section_id is not null
       and not exists (select 1 from public.sections s where s.id = new.section_id and s.task_id = new.parent_id) then
      new.section_id := null;
    end if;
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

create or replace function public.duplicate_project(
  p_project uuid, p_name text, p_include_tasks boolean default true, p_as_template boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_new uuid;
  v_id uuid;
  v_section uuid;
  v_smap jsonb := '{}';
  v_fmap jsonb := '{}';
  v_tmap jsonb := '{}';
  v_text text;
  s record;
  t record;
  ts record;
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
      -- Copy its subtask sections; its subtasks come later in the loop (depth order).
      for ts in select * from public.sections where task_id = t.id order by position loop
        insert into public.sections (task_id, name, position) values (v_id, ts.name, ts.position)
        returning id into v_section;
        v_smap := v_smap || jsonb_build_object(ts.id::text, v_section);
      end loop;
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
