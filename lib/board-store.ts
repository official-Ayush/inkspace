import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http";

export const SCENE_BUCKET = "inkspace-scenes";
export const MAX_SCENE_BYTES = 15_000_000;
export const SCENE_URL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const boardFields = "id,title,favorite,color,revision,created_at,updated_at,scene_key";
export type BoardRow = {
  id: string; title: string; favorite: boolean; color: string; revision: number;
  created_at: string; updated_at: string; scene_key: string;
};
export function publicBoard(row: BoardRow) {
  return {
    id: row.id, title: row.title, favorite: Number(row.favorite), color: row.color,
    revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validScene(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.elements) || value.elements.length > 25_000
    || !isRecord(value.appState)) return false;
  if (!value.elements.every(element => isRecord(element)
    && typeof element.id === "string" && element.id.length > 0 && element.id.length <= 200
    && typeof element.type === "string" && element.type.length > 0 && element.type.length <= 50)) return false;
  if (value.files !== undefined && !isRecord(value.files)) return false;
  // Embedded image data is expected, never remote URLs or arbitrary documents.
  return value.files === undefined || Object.values(value.files as Record<string, unknown>).every(file =>
    isRecord(file) && typeof file.id === "string" && typeof file.dataURL === "string"
    && /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);base64,[a-zA-Z0-9+/=\r\n]+$/.test(file.dataURL));
}
export function boardId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, "Invalid board ID.");
  return value;
}
export function boardTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 120) throw new HttpError(400, "Use a name of 1–120 characters.");
  return value.trim();
}
export function scenePath(value: unknown, userId: string, id: string): string {
  if (typeof value !== "string") throw new HttpError(400, "Upload the drawing before saving.");
  const parts = value.split("/");
  if (parts.length !== 3 || parts[0] !== userId || parts[1] !== id
    || !parts[2].endsWith(".json") || !UUID.test(parts[2].slice(0, -5))) throw new HttpError(400, "Invalid drawing upload.");
  return value;
}
type StoreError = { code?: string; message?: string };
export function checkStoreError(error: StoreError | null) {
  if (!error) return;
  if (error.message?.includes("INKSPACE_UPLOAD_LIMIT")) throw new HttpError(429, "Upload limit reached. Wait before saving again, or export a local backup.");
  if (error.message?.includes("INKSPACE_STORAGE_LIMIT")) throw new HttpError(429, "Workspace storage limit reached. Export a backup and delete unused boards, or try again after old snapshots expire.");
  if (error.message?.includes("INKSPACE_BOARD_LIMIT")) throw new HttpError(429, "Your workspace has reached its 500-board limit.");
  if (error.message?.includes("INKSPACE_BOARD_NOT_FOUND")) throw new HttpError(404, "Board not found.");
  if (error.message?.includes("INKSPACE_INVALID_UPLOAD")) throw new HttpError(400, "That upload expired or is unavailable. Upload the drawing again.");
  if (error.code === "23505") throw new HttpError(409, "This board already exists. Refresh before trying again.");
  if (error.code === "23514" || error.code === "22P02") throw new HttpError(400, "Invalid board update.");
  throw error;
}
export async function ownedBoard(supabase: SupabaseClient, userId: string, id: string) {
  const { data, error } = await supabase.from("boards").select(boardFields).eq("id", id).eq("user_id", userId).maybeSingle();
  checkStoreError(error);
  if (!data) throw new HttpError(404, "Board not found.");
  return data as BoardRow;
}
export async function validateSceneUpload(supabase: SupabaseClient, userId: string, id: string, key: unknown) {
  const path = scenePath(key, userId, id);
  const { data: reservation, error: reservationError } = await supabase.from("board_uploads")
    .select("scene_key").eq("scene_key", path).eq("user_id", userId).eq("board_id", id)
    .eq("cancelled", false).gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).maybeSingle();
  checkStoreError(reservationError);
  if (!reservation) throw new HttpError(400, "That upload expired. Upload the drawing again.");
  // Bucket limits enforce bytes/MIME. This fetch is server-to-storage only;
  // browser uploads and downloads bypass the Vercel request/response size cap.
  const { data, error } = await supabase.storage.from(SCENE_BUCKET).download(path);
  if (error || !data) throw new HttpError(400, "The uploaded drawing is unavailable. Try uploading it again.");
  if (data.size > MAX_SCENE_BYTES) throw new HttpError(413, "Board exceeds 15 MB. Export a backup and reduce image sizes.");
  let scene: unknown;
  try { scene = JSON.parse(await data.text()); } catch { throw new HttpError(400, "Invalid drawing JSON."); }
  if (!validScene(scene)) throw new HttpError(400, "The upload is not a valid drawing.");
  return path;
}
export async function cleanupScenes(supabase: SupabaseClient, userId: string, deletedBoardId?: string) {
  // A committed save/delete stays successful if cleanup fails. Storage policies
  // independently forbid deleting referenced objects or reusing retired paths.
  try {
    const { data, error } = await supabase.rpc("retired_board_uploads", { p_board_id: deletedBoardId ?? null });
    if (error || !data?.length) return;
    const paths = (data as { scene_key: string }[]).map(row => row.scene_key);
    const { data: active, error: activeError } = await supabase.from("boards").select("scene_key").eq("user_id", userId).in("scene_key", paths);
    if (activeError) return;
    const referenced = new Set((active ?? []).map(row => row.scene_key));
    const retired = paths.filter(path => !referenced.has(path));
    if (retired.length) await supabase.storage.from(SCENE_BUCKET).remove(retired);
  } catch { console.warn("Deferred cleanup of old drawing snapshots."); }
}
