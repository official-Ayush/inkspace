import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithPassword } from '../lib/auth/flows';
import { assertApprovedUser, parseAuthConfiguration, parseCaptchaToken, parsePassword } from '../lib/auth/policy';

const environment = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_validTestKey0123456789',
  INKSPACE_ALLOWED_EMAILS: ' Owner@Example.com , second@example.com,owner@example.com ',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAvalidSiteKey12345',
};
const configuration = () => parseAuthConfiguration(environment);
const approvedUser = { email: 'owner@example.com', email_confirmed_at: '2026-10-03T00:00:00Z' };
type ProviderError = { status: number; message?: string };

function mockAuth(options: {
  signInError?: ProviderError;
  userError?: ProviderError;
  user?: typeof approvedUser | null;
} = {}) {
  const calls: { method: string; argument?: unknown }[] = [];
  const client = {
    auth: {
      async signInWithPassword(argument: unknown) {
        calls.push({ method: 'signInWithPassword', argument });
        return { error: options.signInError ?? null };
      },
      async getUser() {
        calls.push({ method: 'getUser' });
        return { data: { user: Object.hasOwn(options, 'user') ? options.user : approvedUser }, error: options.userError ?? null };
      },
      async signOut(argument: unknown) {
        calls.push({ method: 'signOut', argument });
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('auth configuration fails closed and normalizes the explicit allowlist', () => {
  const config = configuration();
  assert.deepEqual([...config.allowedEmails], ['owner@example.com', 'second@example.com']);
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'INKSPACE_ALLOWED_EMAILS', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY']) {
    assert.throws(() => parseAuthConfiguration({ ...environment, [key]: '' }), { status: 503 });
  }
  for (const url of ['http://project.supabase.co', 'http://localhost:54321', 'https://user:password@project.supabase.co', 'https://project.supabase.co/path']) {
    assert.throws(() => parseAuthConfiguration({ ...environment, SUPABASE_URL: url }), { status: 503 });
  }
  assert.throws(() => parseAuthConfiguration({ ...environment, INKSPACE_ALLOWED_EMAILS: '*' }), { status: 503 });
  for (const siteKey of ['replace_me', '1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF']) {
    assert.throws(() => parseAuthConfiguration({ ...environment, NEXT_PUBLIC_TURNSTILE_SITE_KEY: siteKey }), { status: 503 });
  }
});

test('secret and service-role credentials cannot be used to bypass RLS', () => {
  const legacyKey = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_secretValue', 'sb_publishable_replace_me', legacyKey('service_role'), legacyKey('authenticated'), 'not-a-key']) {
    assert.throws(() => parseAuthConfiguration({ ...environment, SUPABASE_PUBLISHABLE_KEY: key }), { status: 503 });
  }
  assert.equal(parseAuthConfiguration({ ...environment, SUPABASE_PUBLISHABLE_KEY: legacyKey('anon') }).publishableKey, legacyKey('anon'));
});

test('only confirmed allowed users are authorized and input lengths are bounded', () => {
  assert.doesNotThrow(() => assertApprovedUser(approvedUser, configuration()));
  assert.throws(() => assertApprovedUser(null, configuration()), { status: 401 });
  assert.throws(() => assertApprovedUser({ email: approvedUser.email }, configuration()), { status: 403 });
  assert.throws(() => assertApprovedUser({ ...approvedUser, email: 'stranger@example.com' }, configuration()), { status: 403 });
  for (const password of ['', undefined, 123456, 'x'.repeat(1025)]) assert.throws(() => parsePassword(password), { status: 400 });
  assert.equal(parsePassword(' password with spaces '), ' password with spaces ');
  for (const token of [undefined, '', ' ', 'a'.repeat(2049)]) assert.throws(() => parseCaptchaToken(token, true), { status: 400 });
});

test('password sign-in requires CAPTCHA and never calls the provider for blocked emails', async () => {
  const { client, calls } = mockAuth();
  await assert.rejects(signInWithPassword(client, configuration(), { email: approvedUser.email, password: 'test-password' }), { status: 400 });
  await assert.rejects(signInWithPassword(client, configuration(), { email: 'stranger@example.com', password: 'test-password', captchaToken: 'captcha-proof' }), { status: 400 });
  assert.deepEqual(calls, []);
});

test('password failures hide account and provider details and never accept a session', async () => {
  for (const signInError of [{ status: 400, message: 'user does not exist' }, { status: 500, message: 'private provider detail' }]) {
    const { client, calls } = mockAuth({ signInError });
    await assert.rejects(signInWithPassword(client, configuration(), { email: ' Owner@Example.com ', password: 'test-password', captchaToken: 'captcha-proof' }), { status: 400, message: 'Unable to sign in. Check your email and password, or contact the workspace owner.' });
    assert.deepEqual(calls.map(call => call.method), ['signInWithPassword']);
  }
});

test('verification revalidates the identity with Auth before accepting a session', async () => {
  const { client, calls } = mockAuth();
  assert.deepEqual(await signInWithPassword(client, configuration(), { email: ' Owner@Example.com ', password: ' test-password ', captchaToken: 'captcha-proof' }), { ok: true });
  assert.deepEqual(calls, [
    { method: 'signInWithPassword', argument: { email: approvedUser.email, password: ' test-password ', options: { captchaToken: 'captcha-proof' } } },
    { method: 'getUser' },
  ]);
});

test('an unexpected, unconfirmed or unverifiable identity clears the local session', async () => {
  for (const options of [
    { user: { ...approvedUser, email: 'second@example.com' } },
    { user: { ...approvedUser, email: 'stranger@example.com' } },
    { user: { ...approvedUser, email_confirmed_at: '' } },
    { user: null },
    { userError: { status: 401 } },
  ]) {
    const { client, calls } = mockAuth(options);
    await assert.rejects(signInWithPassword(client, configuration(), { email: approvedUser.email, password: 'test-password', captchaToken: 'captcha-proof' }), { status: 400 });
    assert.deepEqual(calls.at(-1), { method: 'signOut', argument: { scope: 'local' } });
  }
});

test('invalid and blocked credentials cannot request an Auth session', async () => {
  const { client, calls } = mockAuth();
  for (const body of [{ email: 'stranger@example.com', password: 'test-password' }, { email: approvedUser.email, password: '' }, { email: approvedUser.email, password: 'x'.repeat(1025) }]) {
    await assert.rejects(signInWithPassword(client, configuration(), { ...body, captchaToken: 'captcha-proof' }), { status: 400 });
  }
  assert.deepEqual(calls, []);
});

test('provider rate limits remain rate limits for password requests', async () => {
  const send = mockAuth({ signInError: { status: 429 } });
  await assert.rejects(signInWithPassword(send.client, configuration(), { email: approvedUser.email, password: 'test-password', captchaToken: 'captcha-proof' }), { status: 429 });
  assert.deepEqual(send.calls.map(call => call.method), ['signInWithPassword']);
});
