import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boardId, boardTitle, checkStoreError, cleanupScenes, MAX_SCENE_BYTES, ownedBoard, publicBoard, scenePath, validScene, validateSceneUpload } from "../lib/board-store";
import { HttpError } from "../lib/http";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const key = `${owner}/${id}/33333333-3333-4333-8333-333333333333.json`;
const goodScene = { elements: [{ id: "shape-1", type: "rectangle" }], appState: {}, files: {} };
const status = (expected: number) => (error: unknown) => error instanceof HttpError && error.status === expected;

test("drawing validation rejects malformed and remote file payloads", () => {
  assert.equal(validScene(goodScene), true);
  for (const value of [null, [], { ...goodScene, appState: null }, { ...goodScene, elements: [null] },
    { ...goodScene, elements: Array(25_001).fill({ id: "x", type: "text" }) },
    { ...goodScene, files: { x: { id: "x", dataURL: "https://attacker.invalid/image.png" } } },
    { ...goodScene, files: { x: { id: "x", dataURL: "data:text/html;base64,PHNjcmlwdD4=" } } }]) {
    assert.equal(validScene(value), false);
  }
  assert.equal(validScene({ ...goodScene, files: { x: { id: "x", dataURL: "data:image/png;base64,YQ==" } } }), true);
});

test("scene paths bind both user and board without traversal or URL inputs", () => {
  assert.equal(scenePath(key, owner, id), key);
  for (const value of [key.replace(owner, id), key.replace(`/${id}/`, `/${owner}/`), `../${key}`, `${key}/extra`, `https://example.com/${key}`, null]) {
    assert.throws(() => scenePath(value, owner, id), status(400));
  }
  assert.equal(boardId(id), id);
  assert.throws(() => boardId("../../other"), status(400));
});

test("board titles are trimmed, bounded and never coerced", () => {
  assert.equal(boardTitle("  Hello  "), "Hello");
  for (const value of [" ", "x".repeat(121), 42, {}]) assert.throws(() => boardTitle(value), status(400));
});

test("public board metadata omits ownership and private object keys", () => {
  assert.deepEqual(publicBoard({ id, title: "Hello", favorite: true, color: "#123456", revision: 9,
    created_at: "created", updated_at: "updated", scene_key: key }), {
    id, title: "Hello", favorite: 1, color: "#123456", revision: 9, createdAt: "created", updatedAt: "updated",
  });
});

function uploadClient(options: { reservation?: boolean; contents?: string; size?: number } = {}) {
  const filters: [string, unknown][] = [];
  let downloads = 0;
  const query = {
    select: () => query, eq: (name: string, value: unknown) => { filters.push([name, value]); return query; },
    gte: () => query, maybeSingle: async () => ({ data: options.reservation === false ? null : { scene_key: key }, error: null }),
  };
  const client = {
    from: () => query,
    storage: { from: () => ({ download: async () => {
      downloads++;
      return { data: { size: options.size ?? 100, text: async () => options.contents ?? JSON.stringify(goodScene) }, error: null };
    } }) },
  } as unknown as SupabaseClient;
  return { client, filters, downloads: () => downloads };
}

test("server validates the uploaded object using its own user and board filters", async () => {
  const fixture = uploadClient();
  assert.equal(await validateSceneUpload(fixture.client, owner, id, key), key);
  assert.deepEqual(fixture.filters, [["scene_key", key], ["user_id", owner], ["board_id", id], ["cancelled", false]]);
  assert.equal(fixture.downloads(), 1);
});

test("foreign and expired upload capabilities cannot cause a storage download", async () => {
  const foreign = uploadClient();
  await assert.rejects(validateSceneUpload(foreign.client, id, id, key), status(400));
  assert.equal(foreign.downloads(), 0);
  const expired = uploadClient({ reservation: false });
  await assert.rejects(validateSceneUpload(expired.client, owner, id, key), status(400));
  assert.equal(expired.downloads(), 0);
});

test("oversized, invalid JSON and malformed scenes cannot be committed", async () => {
  await assert.rejects(validateSceneUpload(uploadClient({ size: MAX_SCENE_BYTES + 1 }).client, owner, id, key), status(413));
  await assert.rejects(validateSceneUpload(uploadClient({ contents: "broken{" }).client, owner, id, key), status(400));
  await assert.rejects(validateSceneUpload(uploadClient({ contents: '{"elements":[]}' }).client, owner, id, key), status(400));
});

test("missing boards return 404 after an explicit owner predicate", async () => {
  const predicates: [string, string][] = [];
  const query = { select: () => query, eq: (name: string, value: string) => { predicates.push([name, value]); return query; },
    maybeSingle: async () => ({ data: null, error: null }) };
  await assert.rejects(ownedBoard({ from: () => query } as unknown as SupabaseClient, owner, id), status(404));
  assert.deepEqual(predicates, [["id", id], ["user_id", owner]]);
});

test("cleanup excludes active snapshots and failure cannot undo a successful deletion", async () => {
  const retired = key.replace("33333333", "44444444");
  let removed: string[] = [];
  const query = { select: () => query, eq: () => query, in: async () => ({ data: [{ scene_key: key }], error: null }) };
  const client = { rpc: async () => ({ data: [{ scene_key: key }, { scene_key: retired }], error: null }), from: () => query,
    storage: { from: () => ({ remove: async (paths: string[]) => { removed = paths; throw new Error("Storage unavailable"); } }) },
  } as unknown as SupabaseClient;
  await assert.doesNotReject(cleanupScenes(client, owner, id));
  assert.deepEqual(removed, [retired]);
});

test("durable quota and database validation failures produce actionable statuses", () => {
  for (const marker of ["INKSPACE_UPLOAD_LIMIT", "INKSPACE_STORAGE_LIMIT", "INKSPACE_BOARD_LIMIT"]) {
    assert.throws(() => checkStoreError({ message: marker }), status(429));
  }
  assert.throws(() => checkStoreError({ message: "INKSPACE_INVALID_UPLOAD" }), status(400));
  assert.throws(() => checkStoreError({ message: "INKSPACE_BOARD_NOT_FOUND" }), status(404));
  assert.throws(() => checkStoreError({ code: "23505" }), status(409));
});
