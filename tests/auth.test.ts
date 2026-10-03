import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CODE_SENT_MESSAGE, requestSignInCode, verifySignInCode } from '../lib/auth/flows';
import { assertApprovedUser, parseAuthConfiguration, parseCaptchaToken, parseOtp } from '../lib/auth/policy';

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
  verifyError?: ProviderError;
  userError?: ProviderError;
  user?: typeof approvedUser | null;
} = {}) {
  const calls: { method: string; argument?: unknown }[] = [];
  const client = {
    auth: {
      async signInWithOtp(argument: unknown) {
        calls.push({ method: 'signInWithOtp', argument });
        return { error: options.signInError ?? null };
      },
      async verifyOtp(argument: unknown) {
        calls.push({ method: 'verifyOtp', argument });
        return { error: options.verifyError ?? null };
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
  for (const token of ['12345', '12345678901', '12abcd', 123456]) assert.throws(() => parseOtp(token), { status: 400 });
  for (const token of [undefined, '', ' ', 'a'.repeat(2049)]) assert.throws(() => parseCaptchaToken(token, true), { status: 400 });
});

test('requesting a code requires CAPTCHA and never calls the provider for blocked emails', async () => {
  const { client, calls } = mockAuth();
  await assert.rejects(requestSignInCode(client, configuration(), { email: approvedUser.email }), { status: 400 });
  assert.deepEqual(await requestSignInCode(client, configuration(), { email: 'stranger@example.com', captchaToken: 'captcha-proof' }), { message: CODE_SENT_MESSAGE });
  assert.deepEqual(calls, []);
});

test('approved code requests disable account creation and hide account/provider details', async () => {
  for (const signInError of [undefined, { status: 400, message: 'user does not exist' }, { status: 500, message: 'private SMTP detail' }]) {
    const { client, calls } = mockAuth({ signInError });
    const result = await requestSignInCode(client, configuration(), { email: ' Owner@Example.com ', captchaToken: 'captcha-proof' });
    assert.deepEqual(result, { message: CODE_SENT_MESSAGE });
    assert.deepEqual(calls, [{ method: 'signInWithOtp', argument: { email: approvedUser.email, options: { shouldCreateUser: false, captchaToken: 'captcha-proof' } } }]);
  }
});

test('verification revalidates the identity with Auth before accepting a session', async () => {
  const { client, calls } = mockAuth();
  assert.deepEqual(await verifySignInCode(client, configuration(), { email: ' Owner@Example.com ', token: ' 123456 ' }), { ok: true });
  assert.deepEqual(calls, [
    { method: 'verifyOtp', argument: { email: approvedUser.email, token: '123456', type: 'email' } },
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
    await assert.rejects(verifySignInCode(client, configuration(), { email: approvedUser.email, token: '123456' }), { status: 400 });
    assert.deepEqual(calls.at(-1), { method: 'signOut', argument: { scope: 'local' } });
  }
});

test('invalid and blocked verification attempts cannot request an Auth session', async () => {
  const { client, calls } = mockAuth();
  for (const body of [{ email: 'stranger@example.com', token: '123456' }, { email: approvedUser.email, token: 'invalid' }]) {
    await assert.rejects(verifySignInCode(client, configuration(), body), { status: 400 });
  }
  assert.deepEqual(calls, []);
  const failed = mockAuth({ verifyError: { status: 400, message: 'private provider detail' } });
  await assert.rejects(verifySignInCode(failed.client, configuration(), { email: approvedUser.email, token: '123456' }), { status: 400, message: 'This code is invalid or expired. Request a new code and try again.' });
  assert.deepEqual(failed.calls.map(call => call.method), ['verifyOtp']);
});

test('provider rate limits remain rate limits for send and verify requests', async () => {
  const send = mockAuth({ signInError: { status: 429 } });
  await assert.rejects(requestSignInCode(send.client, configuration(), { email: approvedUser.email, captchaToken: 'captcha-proof' }), { status: 429 });
  const verify = mockAuth({ verifyError: { status: 429 } });
  await assert.rejects(verifySignInCode(verify.client, configuration(), { email: approvedUser.email, token: '123456' }), { status: 429 });
  assert.deepEqual(verify.calls.map(call => call.method), ['verifyOtp']);
});
