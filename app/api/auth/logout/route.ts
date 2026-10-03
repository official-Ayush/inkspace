import { assertSameOrigin, failure, HttpError, jsonNoStore } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new HttpError(503, "Could not finish signing out. Please try again.");
    return jsonNoStore({ ok: true });
  } catch (error) { return failure(error); }
}
