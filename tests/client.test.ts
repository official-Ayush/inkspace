import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../lib/board-client';

test('large drawing uploads directly; Vercel receives only metadata', async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    if (String(url) === '/api/boards/uploads') return Response.json({ boardId: 'new-board', sceneKey: 'owner/board/scene.json', uploadUrl: 'https://storage.example/upload' });
    if (String(url) === 'https://storage.example/upload') return Response.json({ Key: 'scene.json' });
    return Response.json({ id: 'new-board' });
  }) as typeof fetch;
  try {
    await request('/api/boards', { method: 'POST', body: JSON.stringify({ title: 'My board', scene: { elements: [], appState: {}, files: {}, padding: 'x'.repeat(5_000_000) } }) });
    assert.equal(calls.length, 3);
    assert.equal(calls[1].options?.method, 'PUT');
    assert.equal(calls[1].options?.credentials, 'omit');
    assert.equal(calls[1].options?.referrerPolicy, 'no-referrer');
    assert.ok((calls[1].options?.body as Blob).size > 4_500_000);
    const committed = JSON.parse(calls[2].options?.body as string);
    assert.equal(committed.scene, undefined);
    assert.equal(committed.sceneKey, 'owner/board/scene.json');
    assert.equal(committed.id, 'new-board');
    assert.ok((calls[2].options?.body as string).length < 1000);
  } finally { globalThis.fetch = originalFetch; }
});
test('failed uploads do not commit metadata and oversize scenes never request a token', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return calls === 1 ? Response.json({ uploadUrl: 'https://storage.example/upload' }) : new Response('', { status: 500 });
  }) as typeof fetch;
  try {
    await assert.rejects(request('/api/boards', { method: 'POST', body: JSON.stringify({ scene: { elements: [], appState: {} } }) }), /could not be uploaded/);
    assert.equal(calls, 2);
    await assert.rejects(request('/api/boards', { method: 'POST', body: JSON.stringify({ scene: { padding: 'x'.repeat(15_000_001) } }) }), /exceeds 15 MB/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
test('private scene downloads bypass Vercel without cookies and hydrate the existing editor format', async () => {
  const originalFetch = globalThis.fetch;
  const scene = { elements: [], appState: {}, files: {} };
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, options?: RequestInit) => {
    if (++calls === 1) return Response.json({ board: { id: 'test' }, sceneUrl: 'https://storage.example/private?token=example' });
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    return Response.json(scene);
  }) as typeof fetch;
  try { assert.deepEqual(await request('/api/boards/test'), { board: { id: 'test' }, scene }); }
  finally { globalThis.fetch = originalFetch; }
});
