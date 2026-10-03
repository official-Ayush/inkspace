import { boardId, checkStoreError, cleanupScenes, isRecord, SCENE_BUCKET } from "@/lib/board-store";
import { assertSameOrigin, failure, HttpError, jsonNoStore, readJson } from "@/lib/http";
import { getUserContext } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { supabase, user } = await getUserContext();
    const body = await readJson(req);
    if (!isRecord(body)) throw new HttpError(400, "Invalid upload request.");
    const id = body.boardId === undefined ? null : boardId(body.boardId);
    await cleanupScenes(supabase, user.id);
    const { data: reservation, error: reservationError } = await supabase.rpc("reserve_board_upload", { p_board_id: id });
    checkStoreError(reservationError);
    if (!reservation || typeof reservation.boardId !== "string" || typeof reservation.sceneKey !== "string") throw new Error("Unable to reserve drawing upload");
    const { data, error } = await supabase.storage.from(SCENE_BUCKET).createSignedUploadUrl(reservation.sceneKey, { upsert: false });
    checkStoreError(error);
    if (!data) throw new Error("Unable to sign drawing upload");
    return jsonNoStore({ boardId: reservation.boardId, sceneKey: reservation.sceneKey, uploadUrl: data.signedUrl });
  } catch (error) { return failure(error); }
}
