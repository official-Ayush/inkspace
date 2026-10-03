-- RUN ONLY AGAINST A DISPOSABLE SUPABASE PROJECT AFTER APPLYING THE MIGRATION.
-- This transaction creates fixture Auth users and Storage metadata, not files.
-- It always rolls back. It supplements (does not replace) real HTTP tests of
-- signed uploads, download expiration and the two-user browser workflow.
begin;
insert into auth.users(id, email) values
  ('11111111-1111-4111-8111-111111111111', 'inkspace-test-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'inkspace-test-b@example.invalid');

set local role anon;
do $$ begin
  begin
    perform 1 from public.boards;
    raise exception 'FAIL: anonymous board access succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_board_upload(null);
    raise exception 'FAIL: anonymous upload reservation succeeded';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$ declare reservation jsonb; begin
  reservation := public.reserve_board_upload(null);
  perform set_config('inkspace.test_board', reservation->>'boardId', true);
  perform set_config('inkspace.test_key', reservation->>'sceneKey', true);
  insert into storage.objects(bucket_id, name, metadata)
    values('inkspace-scenes', reservation->>'sceneKey', '{"size":100,"mimetype":"application/json"}');
  insert into public.boards(id, user_id, title, scene_key)
    values((reservation->>'boardId')::uuid, auth.uid(), 'Owner A', reservation->>'sceneKey');
  if (select count(*) from public.boards) <> 1 then raise exception 'FAIL: owner cannot read board'; end if;
  if (select count(*) from storage.objects where name = reservation->>'sceneKey') <> 1 then raise exception 'FAIL: owner cannot read object'; end if;
  update public.boards set title = 'Renamed', favorite = true where id = (reservation->>'boardId')::uuid;
  if (select revision from public.boards where id = (reservation->>'boardId')::uuid) <> 1 then raise exception 'FAIL: rename changed scene revision'; end if;
  delete from storage.objects where name = reservation->>'sceneKey';
  if not exists(select 1 from storage.objects where name = reservation->>'sceneKey') then raise exception 'FAIL: current snapshot was deletable'; end if;
  update storage.objects set metadata = '{"size":1}' where name = reservation->>'sceneKey';
  if (select metadata->>'size' from storage.objects where name = reservation->>'sceneKey') <> '100' then raise exception 'FAIL: immutable object was overwritten'; end if;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$ declare affected integer; begin
  if exists(select 1 from public.boards) then raise exception 'FAIL: another user can read boards'; end if;
  if exists(select 1 from public.board_uploads) then raise exception 'FAIL: another user can read upload capabilities'; end if;
  if exists(select 1 from storage.objects where name = current_setting('inkspace.test_key')) then raise exception 'FAIL: another user can read snapshots'; end if;
  update public.boards set title = 'Stolen' where id = current_setting('inkspace.test_board')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another user can rename boards'; end if;
  delete from public.boards where id = current_setting('inkspace.test_board')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another user can delete boards'; end if;
  begin
    perform public.reserve_board_upload(current_setting('inkspace.test_board')::uuid);
    raise exception 'FAIL: another user can upload to board';
  exception when raise_exception then
    if sqlerrm <> 'INKSPACE_BOARD_NOT_FOUND' then raise; end if;
  end;
  begin
    insert into storage.objects(bucket_id, name, metadata) values('inkspace-scenes',
      '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.json',
      '{"size":100,"mimetype":"application/json"}');
    raise exception 'FAIL: unreserved foreign upload succeeded';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$ declare reservation jsonb; affected integer; begin
  reservation := public.reserve_board_upload(current_setting('inkspace.test_board')::uuid);
  insert into storage.objects(bucket_id, name, metadata) values('inkspace-scenes', reservation->>'sceneKey', '{"size":100,"mimetype":"application/json"}');
  update public.boards set scene_key = reservation->>'sceneKey', revision = 2 where id = current_setting('inkspace.test_board')::uuid and revision = 1;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: compare-and-swap save failed'; end if;
  update public.boards set scene_key = current_setting('inkspace.test_key'), revision = 2 where id = current_setting('inkspace.test_board')::uuid and revision = 1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: stale save succeeded'; end if;
  begin
    update public.boards set user_id = '22222222-2222-4222-8222-222222222222' where id = current_setting('inkspace.test_board')::uuid;
    raise exception 'FAIL: ownership transfer succeeded';
  exception when insufficient_privilege or check_violation then null; end;
  delete from public.boards where id = current_setting('inkspace.test_board')::uuid;
  if exists(select 1 from public.board_uploads where board_id = current_setting('inkspace.test_board')::uuid and not cancelled) then raise exception 'FAIL: deleted board has active upload reservations'; end if;
  delete from storage.objects where name = current_setting('inkspace.test_key');
  if exists(select 1 from storage.objects where name = current_setting('inkspace.test_key')) then raise exception 'FAIL: cancelled snapshot cannot be cleaned'; end if;
end $$;

rollback;
