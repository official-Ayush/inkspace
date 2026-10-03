import { HttpError } from "@/lib/http";

export type AuthConfiguration = {
  url: string;
  publishableKey: string;
  allowedEmails: ReadonlySet<string>;
  turnstileSiteKey: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

export function parseAuthConfiguration(env: Record<string, string | undefined>): AuthConfiguration {
  const urlValue = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const emailValues = env.INKSPACE_ALLOWED_EMAILS?.split(",").map(value => value.trim()).filter(Boolean);
  const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  if (!urlValue || !publishableKey || !emailValues?.length) {
    throw new HttpError(503, "Sign-in is not configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and INKSPACE_ALLOWED_EMAILS.");
  }

  let url: URL;
  try { url = new URL(urlValue); } catch {
    throw new HttpError(503, "SUPABASE_URL must be a valid HTTPS project URL.");
  }
  const localDevelopment = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new HttpError(503, "SUPABASE_URL must be a valid HTTPS project URL.");
  }

  // A service-role/secret key would bypass row-level security.
  let isPublicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) && !publishableKey.includes("replace_me");
  if (!isPublicKey && publishableKey.split(".").length === 3) {
    try {
      const payload: unknown = JSON.parse(Buffer.from(publishableKey.split(".")[1], "base64url").toString("utf8"));
      isPublicKey = typeof payload === "object" && payload !== null && "role" in payload && payload.role === "anon";
    } catch { /* Invalid keys are rejected below. */ }
  }
  if (!isPublicKey) throw new HttpError(503, "SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key, never a secret or service-role key.");

  const allowedEmails = new Set<string>();
  for (const email of emailValues) {
    try { allowedEmails.add(normalizeEmail(email)); } catch {
      throw new HttpError(503, "INKSPACE_ALLOWED_EMAILS must contain comma-separated, complete email addresses.");
    }
  }
  if (env.NODE_ENV === "production" && (!turnstileSiteKey || turnstileSiteKey === "replace_me" || /^[123]x0{8}/.test(turnstileSiteKey))) {
    throw new HttpError(503, "Production sign-in requires NEXT_PUBLIC_TURNSTILE_SITE_KEY and CAPTCHA protection enabled in Supabase.");
  }
  return { url: url.origin, publishableKey, allowedEmails, turnstileSiteKey };
}

export function isAllowedEmail(email: string | undefined, config: AuthConfiguration): boolean {
  if (!email) return false;
  try { return config.allowedEmails.has(normalizeEmail(email)); } catch { return false; }
}

export function assertApprovedUser(user: { email?: string; email_confirmed_at?: string } | null, config: AuthConfiguration): void {
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  if (!user.email_confirmed_at || !isAllowedEmail(user.email, config)) {
    throw new HttpError(403, "This account does not have access to this workspace.");
  }
}

export function parseOtp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{6,10}$/.test(value.trim())) {
    throw new HttpError(400, "Enter the 6–10 digit code from your email.");
  }
  return value.trim();
}

export function parseCaptchaToken(value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === "") {
    if (required) throw new HttpError(400, "Complete the security check before requesting a code.");
    return undefined;
  }
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) {
    throw new HttpError(400, "Complete the security check again.");
  }
  return value;
}
