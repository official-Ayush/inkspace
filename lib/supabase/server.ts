import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertApprovedUser } from "@/lib/auth/policy";
import { HttpError } from "@/lib/http";
import { authCookieOptions, getAuthConfiguration } from "./config";

export async function createSupabaseServerClient() {
  const config = getAuthConfiguration();
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: authCookieOptions(),
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, { ...options, ...authCookieOptions() }));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes them first.
        }
      },
    },
  });
}

export async function getUserContext() {
  const config = getAuthConfiguration();
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, "Please sign in to continue.");
  assertApprovedUser(user, config);
  return { supabase, user };
}
