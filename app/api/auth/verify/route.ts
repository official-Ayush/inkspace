import { verifySignInCode } from "@/lib/auth/flows";
import { assertSameOrigin, failure, jsonNoStore, readJson } from "@/lib/http";
import { getAuthConfiguration } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const config = getAuthConfiguration();
    const body = await readJson(request);
    const supabase = await createSupabaseServerClient();
    return jsonNoStore(await verifySignInCode(supabase, config, body));
  } catch (error) { return failure(error); }
}
