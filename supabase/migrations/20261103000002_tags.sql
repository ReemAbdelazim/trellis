-- =============================================================================
-- Tags: workspace-wide labels on tasks (any project, or none). The core
-- migration created bare tables; this completes them. Members create, rename
-- and recolour tags; the creator or an admin deletes them. Guests see only the
-- tags on tasks they can see and can't create tags.
-- =============================================================================
alter table public.tags
  add column created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  add constraint tags_name_length check (char_length(trim(name)) between 1 and 50),
  alter column color set default 'teal';
update public.tags set color = 'teal' where color = 'gray';
drop index public.tags_name_idx;
create unique index tags_name_idx on public.tags (lower(trim(name)));

alter table public.task_tags add column created_at timestamptz not null default now();
create index task_tags_tag_idx on public.task_tags (tag_id);

drop policy tags_select on public.tags;
drop policy tags_insert on public.tags;
drop policy tags_update on public.tags;
drop policy tags_delete on public.tags;
drop policy task_tags_select on public.task_tags;
drop policy task_tags_write on public.task_tags;

-- Members see every tag; guests only tags on tasks they can see. A function
-- (not a subquery) so the tags and task_tags policies don't reference each other.
create or replace function public.can_see_tag(p_tag uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.mfa_ok() and (
    private.is_full_member(auth.uid())
    or exists (select 1 from public.task_tags tt where tt.tag_id = p_tag and private.can_view_task(tt.task_id, auth.uid()))
  );
$$;

create policy tags_select on public.tags for select to authenticated using (public.can_see_tag(id));
create policy tags_insert on public.tags for insert to authenticated
  with check (public.is_full_member() and created_by = (select auth.uid()));
create policy tags_update on public.tags for update to authenticated
  using (public.is_full_member()) with check (public.is_full_member());
create policy tags_delete on public.tags for delete to authenticated
  using (public.is_full_member() and (created_by = (select auth.uid()) or public.is_admin()));

-- Visible with the task (tasks RLS applies inside the subquery).
create policy task_tags_select on public.task_tags for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy task_tags_insert on public.task_tags for insert to authenticated
  with check (public.can_edit_task(task_id) and public.can_see_tag(tag_id));
create policy task_tags_delete on public.task_tags for delete to authenticated
  using (public.can_edit_task(task_id));

-- Keep the creator fixed and the colour within the app's palette.
create or replace function public.before_tag_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  if new.color not in ('teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'indigo', 'blue', 'slate') then
    new.color := 'teal';
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger tags_before_write before insert or update on public.tags
  for each row execute function public.before_tag_write();

-- Tagging shows in the task's history and bumps the task, so open lists
-- (subscribed to their project's tasks) refresh.
create or replace function public.after_task_tag_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_task uuid := coalesce(new.task_id, old.task_id);
  v_name text;
begin
  if public.is_silent() then return null; end if;
  select name into v_name from public.tags where id = coalesce(new.tag_id, old.tag_id);
  -- A deleted tag removes itself from every task: no history entry for each.
  if v_name is null then return null; end if;
  perform private.log_activity(v_task, case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end,
    jsonb_build_object('tag', v_name));
  update public.tasks set updated_at = now() where id = v_task;
  return null;
end;
$$;
create trigger task_tags_after_change after insert or delete on public.task_tags
  for each row execute function public.after_task_tag_change();

revoke execute on function public.after_task_tag_change() from public, anon, authenticated;


-- Duplicating a project keeps its tasks' tags.
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

    insert into public.task_tags (task_id, tag_id)
    select public.try_uuid(v_tmap ->> tt.task_id::text), tt.tag_id
    from public.task_tags tt
    where v_tmap ? tt.task_id::text;
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
