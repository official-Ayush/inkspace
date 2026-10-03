import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Execute the real migration against disposable PostgreSQL. These minimal
// schemas stand in for Supabase Auth/Storage; no provider or app data is used.
const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const QUOTA_USER = '30000000-0000-4000-8000-000000000003';
const BUCKET = 'inkspace-scenes';
type Reservation = { boardId: string; sceneKey: string };

test('actual Supabase migration enforces private boards and immutable snapshots', async t => {
  const db = new PGlite();
  await db.waitReady;
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth, storage to anon, authenticated;
      create table storage.buckets(
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects(
        id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
        name text not null, metadata jsonb, unique(bucket_id, name)
      );
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202610030001_private_boards.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [OWNER, OTHER, QUOTA_USER]);

    async function asUser<T>(id: string | null, action: () => Promise<T>, role = 'authenticated'): Promise<T> {
      await db.exec(`set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
      try { return await action(); }
      finally { await db.exec('reset role'); }
    }
    async function reserve(user = OWNER, boardId: string | null = null) {
      return asUser(user, async () => {
        const result = await db.query<{ reservation: Reservation }>('select public.reserve_board_upload($1) as reservation', [boardId]);
        return result.rows[0].reservation;
      });
    }
    async function upload(reservation: Reservation, user = OWNER, metadata = { size: 100, mimetype: 'application/json' }) {
      return asUser(user, () => db.query('insert into storage.objects(bucket_id, name, metadata) values ($1, $2, $3::jsonb)', [BUCKET, reservation.sceneKey, JSON.stringify(metadata)]));
    }
    async function insertBoard(reservation: Reservation, user = OWNER) {
      return asUser(user, () => db.query('insert into public.boards(id, user_id, title, scene_key) values ($1, $2, $3, $4) returning id', [reservation.boardId, user, 'Test board', reservation.sceneKey]));
    }
    const first = await reserve();
    const second = await reserve(OTHER);

    await t.test('first signed-upload reservation admits only its owner to the private bucket', async () => {
      const bucket = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>('select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', [BUCKET]);
      assert.equal(bucket.rows[0].public, false);
      assert.equal(Number(bucket.rows[0].file_size_limit), 15_000_000);
      assert.deepEqual(bucket.rows[0].allowed_mime_types, ['application/json']);
      await assert.rejects(upload(first, OTHER), /row-level security/);
      await upload(first);
      await upload(second, OTHER);
      await insertBoard(first);
      await insertBoard(second, OTHER);
      const own = await asUser(OWNER, () => db.query('select name from storage.objects'));
      assert.deepEqual(own.rows, [{ name: first.sceneKey }]);
    });

    await t.test('board rows and upload reservations are invisible to other owners and anonymous callers', async () => {
      const visible = await asUser(OTHER, () => db.query('select id from public.boards'));
      assert.deepEqual(visible.rows, [{ id: second.boardId }]);
      const uploads = await asUser(OTHER, () => db.query('select scene_key from public.board_uploads where scene_key = $1', [first.sceneKey]));
      assert.equal(uploads.rows.length, 0);
      await assert.rejects(asUser(null, () => db.query('select * from public.boards'), 'anon'), /permission denied/);
      await assert.rejects(asUser(null, () => db.query('select public.reserve_board_upload(null)'), 'anon'), /permission denied/);
      await assert.rejects(asUser(null, () => db.query('select public.reserve_board_upload(null)')), /Authentication required/);
      const anonymousStorage = await asUser(null, () => db.query('select * from storage.objects'), 'anon');
      assert.equal(anonymousStorage.rows.length, 0);
    });

    await t.test('cross-owner rename, delete, upload reservation, and forged insert cannot affect a board', async () => {
      const renamed = await asUser(OTHER, () => db.query('update public.boards set title = $1 where id = $2 returning id', ['stolen', first.boardId]));
      const deleted = await asUser(OTHER, () => db.query('delete from public.boards where id = $1 returning id', [first.boardId]));
      assert.equal(renamed.rows.length, 0); assert.equal(deleted.rows.length, 0);
      await assert.rejects(reserve(OTHER, first.boardId), /INKSPACE_BOARD_NOT_FOUND/);
      await assert.rejects(asUser(OTHER, () => db.query('insert into public.boards(id, user_id, title, scene_key) values (gen_random_uuid(), $1, $2, $3)', [OWNER, 'forged', first.sceneKey])), /Owner mismatch/);
      const row = await db.query<{ title: string }>('select title from public.boards where id = $1', [first.boardId]);
      assert.equal(row.rows[0].title, 'Test board');
    });

    await t.test('ownership, board identity, creation time, and metadata-only revision cannot be changed', async () => {
      await assert.rejects(asUser(OWNER, () => db.query('update public.boards set user_id = $1 where id = $2', [OTHER, first.boardId])), /Owner mismatch/);
      await assert.rejects(asUser(OWNER, () => db.query('update public.boards set id = gen_random_uuid() where id = $1', [first.boardId])), /identity is immutable/);
      await assert.rejects(asUser(OWNER, () => db.query("update public.boards set created_at = created_at - interval '1 day' where id = $1", [first.boardId])), /identity is immutable/);
      await assert.rejects(asUser(OWNER, () => db.query('update public.boards set revision = revision + 1 where id = $1', [first.boardId])), /Invalid revision transition/);
      const updated = await asUser(OWNER, () => db.query<{ title: string; favorite: boolean; revision: number }>('update public.boards set title = $1, favorite = true where id = $2 returning title, favorite, revision', ['  Renamed  ', first.boardId]));
      assert.deepEqual(updated.rows, [{ title: 'Renamed', favorite: true, revision: 1 }]);
    });

    let snapshot: Reservation;
    await t.test('new snapshot increments revision exactly once and stale CAS saves affect zero rows', async () => {
      snapshot = await reserve(OWNER, first.boardId);
      await upload(snapshot);
      await assert.rejects(asUser(OWNER, () => db.query('update public.boards set scene_key = $1 where id = $2', [snapshot.sceneKey, first.boardId])), /Invalid revision transition/);
      const saved = await asUser(OWNER, () => db.query<{ revision: number }>('update public.boards set scene_key = $1, revision = 2 where id = $2 and revision = 1 returning revision', [snapshot.sceneKey, first.boardId]));
      assert.deepEqual(saved.rows, [{ revision: 2 }]);
      const stale = await asUser(OWNER, () => db.query('update public.boards set scene_key = $1, revision = 2 where id = $2 and revision = 1 returning id', [first.sceneKey, first.boardId]));
      assert.equal(stale.rows.length, 0);
    });

    await t.test('unreserved, expired, cancelled, cross-board, and wrong-owner paths cannot become board references', async () => {
      const expired = await reserve();
      await upload(expired);
      await db.query("update public.board_uploads set created_at = now() - interval '11 minutes' where scene_key = $1", [expired.sceneKey]);
      await assert.rejects(insertBoard(expired), /INKSPACE_INVALID_UPLOAD/);
      const cancelled = await reserve();
      await upload(cancelled);
      await db.query('update public.board_uploads set cancelled = true where scene_key = $1', [cancelled.sceneKey]);
      await assert.rejects(insertBoard(cancelled), /INKSPACE_INVALID_UPLOAD/);
      await assert.rejects(asUser(OWNER, () => db.query('insert into public.boards(id, user_id, title, scene_key) values (gen_random_uuid(), $1, $2, $3)', [OWNER, 'wrong-board', snapshot.sceneKey])), /INKSPACE_INVALID_UPLOAD/);
      await assert.rejects(asUser(OWNER, () => db.query('update public.boards set scene_key = $1, revision = 3 where id = $2', [second.sceneKey, first.boardId])), /INKSPACE_INVALID_UPLOAD/);
      const fabricated = { boardId: '40000000-0000-4000-8000-000000000004', sceneKey: `${OWNER}/40000000-0000-4000-8000-000000000004/50000000-0000-4000-8000-000000000005.json` };
      await assert.rejects(upload(fabricated), /row-level security/);
      await assert.rejects(insertBoard(fabricated), /INKSPACE_INVALID_UPLOAD/);
    });

    await t.test('direct client SQL cannot mint, cancel, or rewrite upload reservations', async () => {
      await assert.rejects(asUser(OWNER, () => db.query('update public.board_uploads set cancelled = false where scene_key = $1', [first.sceneKey])), /permission denied/);
      await assert.rejects(asUser(OWNER, () => db.query('delete from public.board_uploads where scene_key = $1', [first.sceneKey])), /permission denied/);
      await assert.rejects(asUser(OWNER, () => db.query('insert into public.board_uploads(scene_key, user_id, board_id) values ($1, $2, $3)', ['fake', OWNER, first.boardId])), /permission denied/);
    });

    await t.test('storage rejects expired/cancelled uploads, overwrite, and deletion of current or fresh snapshots', async () => {
      const expired = await reserve();
      await db.query("update public.board_uploads set created_at = now() - interval '11 minutes' where scene_key = $1", [expired.sceneKey]);
      await assert.rejects(upload(expired), /row-level security/);
      const cancelled = await reserve();
      await db.query('update public.board_uploads set cancelled = true where scene_key = $1', [cancelled.sceneKey]);
      await assert.rejects(upload(cancelled), /row-level security/);
      const overwritten = await asUser(OWNER, () => db.query("update storage.objects set metadata = '{\"size\":1}' where name = $1 returning id", [snapshot.sceneKey]));
      assert.equal(overwritten.rows.length, 0);
      for (const key of [first.sceneKey, snapshot.sceneKey]) {
        const deleted = await asUser(OWNER, () => db.query('delete from storage.objects where name = $1 returning id', [key]));
        assert.equal(deleted.rows.length, 0);
      }
    });

    await t.test('restrictive bucket guards survive unrelated broad permissive policies', async () => {
      await db.exec('create policy unrelated_public_access on storage.objects for all to public using (true) with check (true)');
      const read = await asUser(OTHER, () => db.query('select name from storage.objects where name = $1', [snapshot.sceneKey]));
      const anonRead = await asUser(null, () => db.query('select name from storage.objects'), 'anon');
      const overwrite = await asUser(OWNER, () => db.query("update storage.objects set metadata = '{}' where name = $1 returning id", [snapshot.sceneKey]));
      const deleted = await asUser(OTHER, () => db.query('delete from storage.objects where name = $1 returning id', [snapshot.sceneKey]));
      assert.equal(read.rows.length, 0); assert.equal(anonRead.rows.length, 0); assert.equal(overwrite.rows.length, 0); assert.equal(deleted.rows.length, 0);
      await assert.rejects(asUser(OTHER, () => db.query('insert into storage.objects(bucket_id, name, metadata) values ($1, $2, $3)', [BUCKET, `${OWNER}/fake`, '{}'])), /row-level security/);
      await db.exec('drop policy unrelated_public_access on storage.objects');
    });

    await t.test('retired snapshot cleanup is owner-scoped, reference-safe, and expired keys cannot be replayed', async () => {
      await db.query("update public.board_uploads set created_at = now() - interval '136 minutes' where scene_key in ($1, $2)", [first.sceneKey, snapshot.sceneKey]);
      const retired = await asUser(OWNER, () => db.query<{ scene_key: string }>('select * from public.retired_board_uploads(null)'));
      assert.ok(retired.rows.some(row => row.scene_key === first.sceneKey));
      assert.ok(!retired.rows.some(row => row.scene_key === snapshot.sceneKey));
      assert.ok(retired.rows.every(row => row.scene_key.startsWith(`${OWNER}/`)));
      const crossCleanup = await asUser(OTHER, () => db.query('select * from public.retired_board_uploads($1)', [first.boardId]));
      assert.equal(crossCleanup.rows.length, 0);
      const referenceDelete = await asUser(OWNER, () => db.query('delete from storage.objects where name = $1 returning id', [snapshot.sceneKey]));
      assert.equal(referenceDelete.rows.length, 0);
      await assert.rejects(asUser(OWNER, () => db.query('update public.boards set scene_key = $1, revision = 3 where id = $2', [first.sceneKey, first.boardId])), /INKSPACE_INVALID_UPLOAD/);
      const removed = await asUser(OWNER, () => db.query('delete from storage.objects where name = $1 returning id', [first.sceneKey]));
      assert.equal(removed.rows.length, 1);
      await assert.rejects(upload(first), /row-level security/);
    });

    await t.test('deleting a board cancels all reservations and permits only its unreferenced objects to be collected', async () => {
      await asUser(OWNER, () => db.query('delete from public.boards where id = $1', [first.boardId]));
      const reservations = await db.query<{ cancelled: boolean }>('select cancelled from public.board_uploads where board_id = $1', [first.boardId]);
      assert.ok(reservations.rows.length > 0); assert.ok(reservations.rows.every(row => row.cancelled));
      const retired = await asUser(OWNER, () => db.query<{ scene_key: string }>('select * from public.retired_board_uploads($1)', [first.boardId]));
      assert.deepEqual(retired.rows, [{ scene_key: snapshot.sceneKey }]);
      const removed = await asUser(OWNER, () => db.query('delete from storage.objects where name = $1 returning id', [snapshot.sceneKey]));
      assert.equal(removed.rows.length, 1);
      await assert.rejects(upload(snapshot), /row-level security/);
      await assert.rejects(insertBoard(snapshot), /INKSPACE_INVALID_UPLOAD/);
      assert.equal((await db.query('select * from public.boards where id = $1', [second.boardId])).rows.length, 1);
    });

    await t.test('deleted-board objects remain immutable until signed upload tokens expire', async () => {
      const fresh = await reserve();
      await upload(fresh);
      await insertBoard(fresh);
      await asUser(OWNER, () => db.query('delete from public.boards where id = $1', [fresh.boardId]));
      for (const boardId of [null, fresh.boardId]) {
        const retired = await asUser(OWNER, () => db.query<{ scene_key: string }>('select * from public.retired_board_uploads($1)', [boardId]));
        assert.ok(!retired.rows.some(row => row.scene_key === fresh.sceneKey));
      }
      const removed = await asUser(OWNER, () => db.query('delete from storage.objects where name = $1 returning id', [fresh.sceneKey]));
      assert.equal(removed.rows.length, 0);
      await db.query("update public.board_uploads set created_at = now() - interval '136 minutes' where scene_key = $1", [fresh.sceneKey]);
      const retired = await asUser(OWNER, () => db.query<{ scene_key: string }>('select * from public.retired_board_uploads($1)', [fresh.boardId]));
      assert.deepEqual(retired.rows, [{ scene_key: fresh.sceneKey }]);
    });

    await t.test('reservation quota reserves full pending size and cannot be bypassed by cancellation', async () => {
      // 35 pending 15 MB slots leave less than one additional full slot in 512 MiB.
      await db.query(`insert into public.board_uploads(scene_key, user_id, board_id, cancelled)
        select $1 || '/quota/' || gen_random_uuid()::text || '.json', $1::uuid, gen_random_uuid(), true
        from generate_series(1, 35)`, [QUOTA_USER]);
      await assert.rejects(reserve(QUOTA_USER), /INKSPACE_STORAGE_LIMIT/);
      await db.query('delete from public.board_uploads where user_id = $1', [QUOTA_USER]);
      await db.query(`insert into public.board_uploads(scene_key, user_id, board_id)
        select $1 || '/quota/' || gen_random_uuid()::text || '.json', $1::uuid, gen_random_uuid()
        from generate_series(1, 120)`, [QUOTA_USER]);
      await assert.rejects(reserve(QUOTA_USER), /INKSPACE_UPLOAD_LIMIT/);
    });
  } finally { await db.close(); }
});
