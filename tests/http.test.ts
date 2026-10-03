import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSameOrigin, failure, HttpError, jsonNoStore, readJson } from '../lib/http';

const mutation = (headers: Record<string, string> = {}) => new Request('https://inkspace.example/api/boards', {
  method: 'POST', headers: { origin: 'https://inkspace.example', 'content-type': 'application/json', ...headers }, body: '{}',
});
test('write protection allows same-origin JSON and rejects CSRF, absent origin and non-JSON', () => {
  assert.doesNotThrow(() => assertSameOrigin(mutation()));
  const invalidHeaders: Record<string, string>[] = [{ origin: 'https://evil.example' }, { origin: 'null' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'content-type': 'text/plain' }];
  for (const headers of invalidHeaders) {
    assert.throws(() => assertSameOrigin(mutation(headers)), HttpError);
  }
});
test('body limit measures UTF-8 bytes and rejects chunked oversize, malformed JSON and arrays', async () => {
  assert.deepEqual(await readJson(mutation()), {});
  for (const body of ['[]', 'null', '{broken']) {
    await assert.rejects(readJson(new Request('https://inkspace.example', { method: 'POST', body })), { status: 400 });
  }
  await assert.rejects(readJson(new Request('https://inkspace.example', { method: 'POST', body: JSON.stringify({ value: '🙂'.repeat(10) }) }), 30), { status: 413 });
});
test('private responses and expected failures never cache', async () => {
  const response = jsonNoStore({ ok: true });
  assert.match(response.headers.get('cache-control')!, /private, no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  const denied = failure(new HttpError(401, 'Sign in first.'));
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: 'Sign in first.' });
});
