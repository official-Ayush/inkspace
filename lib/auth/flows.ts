import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http";
import { assertApprovedUser, isAllowedEmail, normalizeEmail, parseCaptchaToken, parsePassword, type AuthConfiguration } from "./policy";

function authFailure(error: { status?: number }, message: string): never {
  if (error.status === 429) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
  throw new HttpError(400, message);
}

export async function signInWithPassword(supabase: SupabaseClient, config: AuthConfiguration, body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const password = parsePassword(body.password);
  const captchaToken = parseCaptchaToken(body.captchaToken, !!config.turnstileSiteKey);
  const invalidMessage = "Unable to sign in. Check your email and password, or contact the workspace owner.";
  if (!isAllowedEmail(email, config)) throw new HttpError(400, invalidMessage);
  // Password sign-in never creates an account or sends an email.
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
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
