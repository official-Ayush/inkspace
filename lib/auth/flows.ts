import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http";
import { assertApprovedUser, isAllowedEmail, normalizeEmail, parseCaptchaToken, parseOtp, type AuthConfiguration } from "./policy";

export const CODE_SENT_MESSAGE = "If this email has access, a sign-in code is on its way. Check your inbox and spam folder.";

function authFailure(error: { status?: number }, message: string): never {
  if (error.status === 429) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
  throw new HttpError(400, message);
}

export async function requestSignInCode(supabase: SupabaseClient, config: AuthConfiguration, body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const captchaToken = parseCaptchaToken(body.captchaToken, !!config.turnstileSiteKey);
  // Never create accounts, and do not reveal which emails are on the allowlist.
  if (!isAllowedEmail(email, config)) return { message: CODE_SENT_MESSAGE };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken } });
  if (error) {
    if (error.status === 429) authFailure(error, "Unable to send a code. Please try again shortly.");
    // Includes unknown users and provider setup errors: no account enumeration.
    return { message: CODE_SENT_MESSAGE };
  }
  return { message: CODE_SENT_MESSAGE };
}

export async function verifySignInCode(supabase: SupabaseClient, config: AuthConfiguration, body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const token = parseOtp(body.token);
  const invalidMessage = "This code is invalid or expired. Request a new code and try again.";
  if (!isAllowedEmail(email, config)) throw new HttpError(400, invalidMessage);
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) authFailure(error, invalidMessage);
  // Revalidate the identity with Auth before accepting the new session.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || !user.email_confirmed_at || !isAllowedEmail(user.email, config) || normalizeEmail(user.email) !== email) {
    await supabase.auth.signOut({ scope: "local" });
    throw new HttpError(400, invalidMessage);
  }
  assertApprovedUser(user, config);
  return { ok: true };
}
