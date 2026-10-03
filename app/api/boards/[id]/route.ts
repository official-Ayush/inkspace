import { boardFields, boardId, boardTitle, checkStoreError, cleanupScenes, isRecord, ownedBoard, publicBoard, SCENE_BUCKET, SCENE_URL_SECONDS, validateSceneUpload, type BoardRow } from "@/lib/board-store";
import { assertSameOrigin, failure, HttpError, jsonNoStore, readJson } from "@/lib/http";
import { getUserContext } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const conflict = () => new HttpError(409, "This board changed in another tab. Save a copy to preserve your edits.");
export async function GET(_req: Request, ctx: Context) {
  try {
    const { supabase, user } = await getUserContext();
    const id = boardId((await ctx.params).id);
    const board = await ownedBoard(supabase, user.id, id);
    const { data, error } = await supabase.storage.from(SCENE_BUCKET).createSignedUrl(board.scene_key, SCENE_URL_SECONDS);
    checkStoreError(error);
    if (!data) throw new Error("Unable to sign scene download");
    return jsonNoStore({ board: publicBoard(board), sceneUrl: data.signedUrl });
  } catch (error) { return failure(error); }
}
export async function PUT(req: Request, ctx: Context) {
  try {
    assertSameOrigin(req);
    const { supabase, user } = await getUserContext();
    const id = boardId((await ctx.params).id);
    const body = await readJson(req);
    if (!isRecord(body) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 1 || (body.revision as number) >= 2_147_483_647) throw new HttpError(400, "Invalid drawing revision.");
    const previous = await ownedBoard(supabase, user.id, id);
    if (previous.revision !== body.revision) throw conflict();
    const sceneKey = await validateSceneUpload(supabase, user.id, id, body.sceneKey);
    if (sceneKey === previous.scene_key) throw new HttpError(400, "Upload a new snapshot before saving.");
    const { data, error } = await supabase.from("boards").update({ scene_key: sceneKey, revision: previous.revision + 1 })
      .eq("id", id).eq("user_id", user.id).eq("revision", previous.revision).select("revision,updated_at").maybeSingle();
    checkStoreError(error);
    if (!data) throw conflict();
    return jsonNoStore({ revision: data.revision, updatedAt: data.updated_at });
  } catch (error) { return failure(error); }
}
export async function PATCH(req: Request, ctx: Context) {
  try {
    assertSameOrigin(req);
    const { supabase, user } = await getUserContext();
    const id = boardId((await ctx.params).id);
    const body = await readJson(req);
    if (!isRecord(body) || (!Object.hasOwn(body, "title") && !Object.hasOwn(body, "favorite"))) throw new HttpError(400, "Invalid board update.");
    const patch: { title?: string; favorite?: boolean } = {};
    if (Object.hasOwn(body, "title")) patch.title = boardTitle(body.title);
    if (Object.hasOwn(body, "favorite")) {
      if (typeof body.favorite !== "boolean") throw new HttpError(400, "Invalid favorite setting.");
      patch.favorite = body.favorite;
    }
    const { data, error } = await supabase.from("boards").update(patch).eq("id", id).eq("user_id", user.id).select(boardFields).maybeSingle();
    checkStoreError(error);
    if (!data) throw new HttpError(404, "Board not found.");
    return jsonNoStore(publicBoard(data as BoardRow));
  } catch (error) { return failure(error); }
}
export async function DELETE(req: Request, ctx: Context) {
  try {
    assertSameOrigin(req);
    const { supabase, user } = await getUserContext();
    const id = boardId((await ctx.params).id);
    const { data, error } = await supabase.from("boards").delete().eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
    checkStoreError(error);
    if (!data) throw new HttpError(404, "Board not found.");
    await cleanupScenes(supabase, user.id, id);
    return jsonNoStore({ deleted: true });
  } catch (error) { return failure(error); }
}
