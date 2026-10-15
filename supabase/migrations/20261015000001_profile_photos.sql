-- =============================================================================
-- Profile photos: people can upload their own picture.
-- Files live at avatars/<user id>/<timestamp>.jpg in a public bucket (photos are
-- shown in emails and avatars everywhere, so they're served without a session).
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars_list_own" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active()
);
create policy "avatars_upload_own" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active()
);
create policy "avatars_remove_own" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active()
);

-- Sign-in refreshes the Google picture, but never replaces a photo the person uploaded.
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform private.provision_profile(new);
  end if;
  update public.profiles p set
    avatar_url = case
      when p.avatar_url like '%/storage/v1/object/public/avatars/%' then p.avatar_url
      else coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', p.avatar_url)
    end,
    last_seen_at = case when new.last_sign_in_at is distinct from old.last_sign_in_at then now() else p.last_seen_at end
  where p.id = new.id;
  return new;
end;
$$;
