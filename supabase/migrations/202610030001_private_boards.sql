-- Apply once to a dedicated Supabase project. No service-role key is needed by
-- the application. Disable public signup in Auth before inviting workspace users.
begin;

create schema if not exists inkspace_private;
revoke all on schema inkspace_private from public;

create table public.boards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120 and length(title) <= 120),
  favorite boolean not null default false,
  color text not null default '#ffd76a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  revision integer not null default 1 check (revision >= 1),
  scene_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owned_scene_path check (
    split_part(scene_key, '/', 1) = user_id::text
    and split_part(scene_key, '/', 2) = id::text
    and scene_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'
  )
);
create index boards_owner_updated on public.boards(user_id, updated_at desc);
alter table public.boards enable row level security;
alter table public.boards force row level security;
revoke all on public.boards from anon, authenticated;
grant select, insert, update, delete on public.boards to authenticated;
create policy boards_select_owner on public.boards for select to authenticated using (user_id = (select auth.uid()));
create policy boards_insert_owner on public.boards for insert to authenticated with check (user_id = (select auth.uid()));
create policy boards_update_owner on public.boards for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy boards_delete_owner on public.boards for delete to authenticated using (user_id = (select auth.uid()));

-- Reservation rows are durable quota/rate records and upload capabilities.
-- Clients may only read their own rows; only the bounded RPC issues new ones.
create table public.board_uploads (
  scene_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null,
  created_at timestamptz not null default now(),
  cancelled boolean not null default false
);
create index board_uploads_owner_created on public.board_uploads(user_id, created_at);
create index board_uploads_board on public.board_uploads(user_id, board_id);
alter table public.board_uploads enable row level security;
alter table public.board_uploads force row level security;
revoke all on public.board_uploads from anon, authenticated;
grant select on public.board_uploads to authenticated;
create policy board_uploads_select_owner on public.board_uploads for select to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('inkspace-scenes', 'inkspace-scenes', false, 15000000, array['application/json'])
on conflict(id) do update set public = false, file_size_limit = 15000000, allowed_mime_types = array['application/json'];

create function public.reserve_board_upload(p_board_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  target_id uuid;
  target_key text;
  pending_count bigint;
  object_count bigint;
  stored_bytes bigint;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Serialize reservations per owner: simultaneous tabs cannot oversubscribe.
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  if p_board_id is not null then
    if not exists(select 1 from public.boards where id = p_board_id and user_id = caller) then
      raise exception 'INKSPACE_BOARD_NOT_FOUND';
    end if;
    target_id := p_board_id;
  else
    if (select count(*) from public.boards where user_id = caller) >= 500 then raise exception 'INKSPACE_BOARD_LIMIT'; end if;
    target_id := gen_random_uuid();
  end if;

  -- Keep one day of rate evidence; keep older rows as long as their objects or
  -- board references exist. Metadata pruning never deletes Storage bytes.
  delete from public.board_uploads u where u.user_id = caller
    and u.created_at < now() - interval '1 day'
    and not exists(select 1 from storage.objects o where o.bucket_id = 'inkspace-scenes' and o.name = u.scene_key)
    and not exists(select 1 from public.boards b where b.scene_key = u.scene_key);
  if (select count(*) from public.board_uploads where user_id = caller and created_at > now() - interval '1 minute') >= 120
    or (select count(*) from public.board_uploads where user_id = caller and created_at > now() - interval '1 day') >= 10000 then
    raise exception 'INKSPACE_UPLOAD_LIMIT';
  end if;
  select count(*) into pending_count from public.board_uploads u where u.user_id = caller
    and u.created_at > now() - interval '135 minutes'
    and not exists(select 1 from storage.objects o where o.bucket_id = 'inkspace-scenes' and o.name = u.scene_key);
  select count(*), coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]{1,10}$'
    then (o.metadata->>'size')::bigint else 15000000 end), 0)
    into object_count, stored_bytes from storage.objects o
    where o.bucket_id = 'inkspace-scenes' and split_part(o.name, '/', 1) = caller::text;
  -- Reserve a complete 15 MB slot until the accepted object has a known size.
  -- This includes cancelled tokens until expiry, since issued tokens survive a
  -- board deletion. Existing uploaded objects are counted at their actual size.
  if pending_count >= 100 then raise exception 'INKSPACE_UPLOAD_LIMIT'; end if;
  if object_count + pending_count >= 2000 or stored_bytes + (pending_count + 1) * 15000000 > 536870912 then
    raise exception 'INKSPACE_STORAGE_LIMIT';
  end if;
  target_key := caller::text || '/' || target_id::text || '/' || gen_random_uuid()::text || '.json';
  insert into public.board_uploads(scene_key, user_id, board_id) values(target_key, caller, target_id);
  return jsonb_build_object('boardId', target_id, 'sceneKey', target_key);
end;
$$;
revoke all on function public.reserve_board_upload(uuid) from public, anon;
grant execute on function public.reserve_board_upload(uuid) to authenticated;

create function inkspace_private.guard_board() returns trigger
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null or new.user_id <> caller then raise exception 'Owner mismatch' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
    if (select count(*) from public.boards where user_id = caller) >= 500 then raise exception 'INKSPACE_BOARD_LIMIT'; end if;
    if new.revision <> 1 then raise exception 'Invalid initial revision' using errcode = '23514'; end if;
    new.created_at := clock_timestamp();
  else
    if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at then
      raise exception 'Board identity is immutable' using errcode = '23514';
    end if;
    if (new.scene_key <> old.scene_key and new.revision <> old.revision + 1)
      or (new.scene_key = old.scene_key and new.revision <> old.revision) then
      raise exception 'Invalid revision transition' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' or new.scene_key <> old.scene_key then
    -- Expired/cancelled keys cannot become referenced again. This is what makes
    -- collection of old snapshots safe even when save and cleanup race.
    perform 1 from public.board_uploads u where u.scene_key = new.scene_key
      and u.user_id = caller and u.board_id = new.id and not u.cancelled
      and u.created_at >= now() - interval '10 minutes' for update;
    if not found then raise exception 'INKSPACE_INVALID_UPLOAD'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id = 'inkspace-scenes' and o.name = new.scene_key
      and o.metadata->>'size' ~ '^[0-9]{1,8}$' and (o.metadata->>'size')::bigint <= 15000000
      and split_part(lower(o.metadata->>'mimetype'), ';', 1) = 'application/json') then
      raise exception 'INKSPACE_INVALID_UPLOAD';
    end if;
  end if;
  new.title := btrim(new.title);
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function inkspace_private.guard_board() from public;
create trigger boards_validate before insert or update on public.boards for each row execute function inkspace_private.guard_board();

create function inkspace_private.cancel_board_uploads() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.board_uploads set cancelled = true where user_id = old.user_id and board_id = old.id;
  return old;
end;
$$;
revoke all on function inkspace_private.cancel_board_uploads() from public;
create trigger boards_cancel_uploads after delete on public.boards for each row execute function inkspace_private.cancel_board_uploads();

-- Restrictive guards keep this bucket protected even if another application
-- later adds broad permissive Storage policies to this Supabase project.
create policy inkspace_read_guard on storage.objects as restrictive for select to public using (
  bucket_id <> 'inkspace-scenes' or (auth.uid() is not null and split_part(name, '/', 1) = auth.uid()::text)
);
create policy inkspace_owner_read on storage.objects for select to authenticated using (
  bucket_id = 'inkspace-scenes' and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy inkspace_insert_guard on storage.objects as restrictive for insert to public with check (
  bucket_id <> 'inkspace-scenes' or (auth.uid() is not null and exists (
    select 1 from public.board_uploads u where u.scene_key = name and u.user_id = auth.uid()
      and not u.cancelled and u.created_at > now() - interval '10 minutes'
  ))
);
create policy inkspace_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'inkspace-scenes' and exists (
    select 1 from public.board_uploads u where u.scene_key = name and u.user_id = (select auth.uid())
      and not u.cancelled and u.created_at > now() - interval '10 minutes'
  )
);
create policy inkspace_immutable_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'inkspace-scenes') with check (bucket_id <> 'inkspace-scenes');
create policy inkspace_delete_guard on storage.objects as restrictive for delete to public using (
  bucket_id <> 'inkspace-scenes' or (
    auth.uid() is not null and split_part(name, '/', 1) = auth.uid()::text
    and not exists(select 1 from public.boards b where b.scene_key = name)
    and exists(select 1 from public.board_uploads u where u.scene_key = name and u.user_id = auth.uid()
      and u.created_at < now() - interval '135 minutes')
  )
);
create policy inkspace_owner_delete on storage.objects for delete to authenticated using (
  bucket_id = 'inkspace-scenes' and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists(select 1 from public.boards b where b.scene_key = name)
  and exists(select 1 from public.board_uploads u where u.scene_key = name and u.user_id = (select auth.uid())
    and u.created_at < now() - interval '135 minutes')
);

-- A bounded query joins actual objects so already-collected reservations do not
-- repeatedly occupy the cleanup page. RLS still rechecks deletion in Storage.
create function public.retired_board_uploads(p_board_id uuid default null)
returns table(scene_key text) language sql security definer set search_path = '' as $$
  select u.scene_key from public.board_uploads u
  join storage.objects o on o.bucket_id = 'inkspace-scenes' and o.name = u.scene_key
  where u.user_id = auth.uid()
    -- Signed upload tokens survive cancellation for two hours. Keep even
    -- deleted-board objects until expiry to prevent replay into a freed key.
    and u.created_at < now() - interval '135 minutes'
    and (p_board_id is null or (u.board_id = p_board_id and u.cancelled))
    and not exists(select 1 from public.boards b where b.scene_key = u.scene_key)
  order by u.created_at asc limit 100;
$$;
revoke all on function public.retired_board_uploads(uuid) from public, anon;
grant execute on function public.retired_board_uploads(uuid) to authenticated;

commit;
