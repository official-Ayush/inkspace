import { boardFields, boardId, boardTitle, checkStoreError, isRecord, publicBoard, validateSceneUpload, type BoardRow } from "@/lib/board-store";
import { assertSameOrigin, failure, HttpError, jsonNoStore, readJson } from "@/lib/http";
import { getUserContext } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { supabase, user } = await getUserContext();
    const { data, error } = await supabase.from("boards").select(boardFields).eq("user_id", user.id).order("updated_at", { ascending: false });
    checkStoreError(error);
    return jsonNoStore({ boards: (data as BoardRow[] ?? []).map(publicBoard) });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { supabase, user } = await getUserContext();
    const body = await readJson(req);
    if (!isRecord(body)) throw new HttpError(400, "Invalid board.");
    const id = boardId(body.id);
    const title = boardTitle(body.title);
    const color = typeof body.color === "string" && /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : "#ffd76a";
    const sceneKey = await validateSceneUpload(supabase, user.id, id, body.sceneKey);
    const { data, error } = await supabase.from("boards").insert({ id, user_id: user.id, title, color, scene_key: sceneKey }).select(boardFields).single();
    checkStoreError(error);
    return jsonNoStore(publicBoard(data as BoardRow), { status: 201 });
  } catch (error) { return failure(error); }
}
