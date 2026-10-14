-- =============================================================================
-- Seeds Tasks — platform wiring: realtime, file storage, scheduled jobs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes respects RLS)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.tasks, public.sections, public.comments, public.task_activity,
  public.attachments, public.task_field_values, public.notifications,
  public.task_followers, public.task_dependencies, public.projects;

-- ---------------------------------------------------------------------------
-- Attachments bucket: objects live at <task_id>/<random>-<file name>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create policy "attachments_read" on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and public.can_view_task(public.try_uuid((storage.foldername(name))[1]))
);
create policy "attachments_upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and public.can_comment_task(public.try_uuid((storage.foldername(name))[1]))
);
create policy "attachments_remove" on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and (owner_id = auth.uid()::text or public.can_edit_task(public.try_uuid((storage.foldername(name))[1])))
);

-- ---------------------------------------------------------------------------
-- Email notifications
--
-- An hourly pg_cron job calls the `notifications` Edge Function, which emails:
--   * new @mentions since the last run (only people who have some), and
--   * a morning digest (8am in each person's time zone) of unread inbox items.
-- The job is a no-op until an admin connects email in the Admin console, which
-- stores the function URL and a shared secret here.
-- ---------------------------------------------------------------------------
alter table public.org_settings add column timezone text not null default 'America/Toronto';
alter table public.profiles add column last_digest_on date;

create table private.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Called by the `admin` Edge Function with the service role.
create or replace function public.configure_notifications(p_url text, p_secret text)
returns void language sql security definer set search_path = '' as $$
  insert into private.app_config (key, value) values ('notifications_url', p_url), ('cron_secret', p_secret)
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

create or replace function public.notification_delivery_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'connected', exists (select 1 from private.app_config where key = 'notifications_url'),
    'url', (select value from private.app_config where key = 'notifications_url'),
    'secret', (select value from private.app_config where key = 'cron_secret'),
    'connected_at', (select updated_at from private.app_config where key = 'notifications_url')
  );
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Daily: remind assignees about tasks due tomorrow (lands before morning digests).
create or replace function private.notify_due_soon()
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, task_id, project_id, data)
  select t.assignee_id, 'due_soon', t.id, t.project_id, jsonb_build_object('due_date', t.due_date)
  from public.tasks t
  join public.profiles p on p.id = t.assignee_id and p.status = 'active'
  where not t.completed and t.due_date = current_date + 1
    and not exists (
      select 1 from public.notifications n
      where n.task_id = t.id and n.type = 'due_soon' and n.created_at > now() - interval '20 hours'
    );
end;
$$;

-- Hourly: hand off to the notifications Edge Function (no-op until connected).
create or replace function private.dispatch_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from private.app_config where key = 'notifications_url');
  v_secret text := (select value from private.app_config where key = 'cron_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('x-cron-secret', v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

select cron.schedule('seeds-due-soon', '0 9 * * *', 'select private.notify_due_soon()');
select cron.schedule('seeds-notifications', '0 * * * *', 'select private.dispatch_notifications()');

-- ---------------------------------------------------------------------------
-- API surface: nothing for anonymous visitors; signed-in users get the
-- permission helpers and RPCs the app calls; internal functions stay private.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user(), public.handle_user_updated() from authenticated;
revoke execute on function public.configure_notifications(text, text), public.notification_delivery_status()
  from public, anon, authenticated;
grant execute on function public.configure_notifications(text, text), public.notification_delivery_status() to service_role;
revoke all on all functions in schema private from public, anon, authenticated;
