-- Comment mentions: derived from the text, notified on edit, and an audience
-- helper so the composer only offers people who can see the task.

-- The @[Name](uuid) tokens in a comment, deduplicated, capped like the column.
create or replace function private.mentions_in(p_body text)
returns uuid[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from (
    select distinct m[1]::uuid as id
    from regexp_matches(coalesce(p_body, ''),
      '@\[[^\]]+\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)', 'g') m
    limit 50
  ) x;
$$;

-- Notify each mentioned person (who can see the task) and make them a follower.
create or replace function private.notify_mentions(p_comment public.comments, p_users uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (select project_id from public.tasks where id = p_comment.task_id);
  m uuid;
begin
  foreach m in array coalesce(p_users, '{}') loop
    perform private.notify(m, 'mentioned', p_comment.task_id, v_project, p_comment.id,
      jsonb_build_object('excerpt', left(p_comment.body, 200)));
    if private.can_view_task(p_comment.task_id, m) then
      insert into public.task_followers (task_id, user_id) values (p_comment.task_id, m) on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- Mentions always come from the text, so they can't drift from it or be spoofed.
create or replace function public.before_comment_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.task_id := old.task_id;
    -- Fixed after creation; only cleared when the person's account is deleted.
    if auth.uid() is not null or new.author_id is not null then new.author_id := old.author_id; end if;
    new.created_at := old.created_at;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  new.mentions := private.mentions_in(new.body);
  return new;
end;
$$;

drop trigger comments_before_update on public.comments;
drop function public.before_comment_update();
create trigger comments_before_write before insert or update on public.comments
  for each row execute function public.before_comment_write();

create or replace function public.after_comment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f record;
  v_project uuid := (select project_id from public.tasks where id = new.task_id);
begin
  if new.author_id is not null then
    insert into public.task_followers (task_id, user_id) values (new.task_id, new.author_id) on conflict do nothing;
  end if;

  perform private.notify_mentions(new, new.mentions);

  for f in select user_id from public.task_followers
           where task_id = new.task_id and user_id <> all (new.mentions) loop
    perform private.notify(f.user_id, 'commented', new.task_id, v_project, new.id,
      jsonb_build_object('excerpt', left(new.body, 200)));
  end loop;

  return null;
end;
$$;

-- Editing a comment notifies only the people it newly mentions.
create or replace function public.after_comment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_mentions(new, array(select unnest(new.mentions) except select unnest(old.mentions)));
  return null;
end;
$$;

create trigger comments_after_update after update of body on public.comments
  for each row execute function public.after_comment_update();

-- Who can see a task: the people a comment on it can usefully mention.
create or replace function public.task_audience(p_task uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where public.can_view_task(p_task) and p.status = 'active' and private.can_view_task(p_task, p.id);
$$;

revoke execute on function private.mentions_in(text) from public, anon, authenticated;
revoke execute on function private.notify_mentions(public.comments, uuid[]) from public, anon, authenticated;
revoke execute on function public.task_audience(uuid) from public, anon;
grant execute on function public.task_audience(uuid) to authenticated;
