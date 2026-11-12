-- Deleting a tagged task cascades to task_tags; the history trigger then tried to
-- log "tag removed" against the task being deleted, the foreign key refused, and
-- the whole delete failed. Skip history when the tag or the task is going away.
create or replace function public.after_task_tag_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_task uuid := coalesce(new.task_id, old.task_id);
  v_name text;
begin
  if public.is_silent() then return null; end if;
  select name into v_name from public.tags where id = coalesce(new.tag_id, old.tag_id);
  -- A deleted tag or task removes its own links: no history entry for each.
  if v_name is null or not exists (select 1 from public.tasks where id = v_task) then return null; end if;
  perform private.log_activity(v_task, case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end,
    jsonb_build_object('tag', v_name));
  update public.tasks set updated_at = now() where id = v_task;
  return null;
end;
$$;
