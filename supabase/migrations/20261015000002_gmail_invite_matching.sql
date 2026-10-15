-- =============================================================================
-- Invitations match Gmail addresses the way Gmail delivers them: dots and
-- "+tag" in the name don't matter, and googlemail.com is gmail.com. An invite
-- to "jane.doe+work@gmail.com" lets "janedoe@gmail.com" sign in.
-- =============================================================================

-- The address a mailbox is known by, for comparing invitations with sign-ins.
create or replace function private.email_key(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else e
  end
  from (select lower(trim(coalesce(p_email, ''))) as e) x;
$$;

create or replace function private.workspace_role_for(p_email text)
returns public.user_role language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(coalesce(p_email, ''));
  v_invite public.invitations%rowtype;
begin
  if v_email = '' then
    raise exception 'SEEDS_NOT_AUTHORIZED: an email address is required';
  end if;

  select * into v_invite from public.invitations
    where private.email_key(email) = private.email_key(v_email) and accepted_at is null
    order by created_at desc limit 1;

  if split_part(v_email, '@', 2) = any (select lower(d) from public.org_settings, unnest(allowed_domains) d where id = 1) then
    if not exists (select 1 from public.profiles where role = 'admin') or v_invite.role = 'admin' then
      return 'admin';
    end if;
    return 'member';
  elsif v_invite.id is not null then
    return v_invite.role;
  end if;
  raise exception 'SEEDS_NOT_AUTHORIZED: % is not a member of this workspace', v_email;
end;
$$;

create or replace function private.provision_profile(p_user auth.users)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(p_user.email);
  v_role public.user_role := private.workspace_role_for(v_email);
  v_invite public.invitations%rowtype;
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    p_user.id,
    v_email,
    coalesce(nullif(p_user.raw_user_meta_data ->> 'full_name', ''), nullif(p_user.raw_user_meta_data ->> 'name', ''), split_part(v_email, '@', 1)),
    coalesce(p_user.raw_user_meta_data ->> 'avatar_url', p_user.raw_user_meta_data ->> 'picture'),
    v_role
  )
  on conflict (id) do nothing;
  if not found then return; end if; -- already provisioned

  -- Inbox item + "first access" email (notify() skips self-notifications).
  insert into public.notifications (user_id, actor_id, type) values (p_user.id, null, 'welcome');

  select * into v_invite from public.invitations
    where private.email_key(email) = private.email_key(v_email) and accepted_at is null
    order by created_at desc limit 1;
  if v_invite.id is null then return; end if;

  perform private.notify(v_invite.invited_by, 'invite_accepted', null, v_invite.project_id,
    p_data => jsonb_build_object('user_id', p_user.id), p_actor => p_user.id);

  update public.invitations set accepted_at = now()
    where private.email_key(email) = private.email_key(v_email) and accepted_at is null;
  if v_invite.project_id is not null and private.can_edit_project(v_invite.project_id, v_invite.invited_by) then
    insert into public.project_members (project_id, user_id, role)
    values (v_invite.project_id, p_user.id, 'editor') on conflict do nothing;
  end if;
  if v_invite.team_id is not null and private.is_team_admin(v_invite.team_id, v_invite.invited_by) then
    insert into public.team_members (team_id, user_id) values (v_invite.team_id, p_user.id) on conflict do nothing;
  end if;
end;
$$;

revoke execute on function private.email_key(text) from public, anon, authenticated;
