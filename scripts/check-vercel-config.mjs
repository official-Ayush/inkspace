import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) loadEnvFile('.env.local');
const problems = [];
try {
  const url = new URL(process.env.SUPABASE_URL ?? '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
} catch { problems.push('SUPABASE_URL must be your HTTPS Supabase project origin.'); }
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
let isPublicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !key.includes('replace_me');
if (!isPublicKey) {
  try { isPublicKey = key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch {}
}
if (!isPublicKey) problems.push('SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key, never a secret/service-role key.');
const emails = (process.env.INKSPACE_ALLOWED_EMAILS ?? '').split(',').map(value => value.trim()).filter(Boolean);
if (!emails.length || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === 'you@example.com')) problems.push('Set INKSPACE_ALLOWED_EMAILS to the actual email addresses you approve.');
const captcha = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
if (!captcha || captcha === 'replace_me' || /^[123]x0{8}/.test(captcha)) problems.push('Set a real NEXT_PUBLIC_TURNSTILE_SITE_KEY for production.');
if (problems.length) {
  console.error('Deployment configuration is incomplete:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Environment variable formats look valid. No credentials were printed.');
  console.log('Still verify the SQL migration, private bucket, disabled signups, email template, SMTP and CAPTCHA configuration in Supabase.');
}
