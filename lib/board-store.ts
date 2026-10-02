import { env } from "cloudflare:workers";
export function storage() {
  const bindings = env as unknown as { DB: D1Database; BUCKET: R2Bucket };
  if (!bindings.DB || !bindings.BUCKET) throw new Error("Workspace storage unavailable");
  return { db: bindings.DB, bucket: bindings.BUCKET };
}
export function failure(error: unknown) {
  console.error("Board storage:", error);
  return Response.json({ error: "Your workspace is temporarily unavailable. Please try again; your open drawing is kept on screen." }, { status: 503 });
}
export function validScene(scene: any) {
  return scene && typeof scene === "object" && Array.isArray(scene.elements)
    && scene.elements.length <= 25000 && typeof scene.appState === "object"
    && scene.elements.every((el: any) => el && typeof el.id === "string" && typeof el.type === "string")
    && (!scene.files || (typeof scene.files === "object" && !Array.isArray(scene.files)));
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}
export const publicFields = "id, title, favorite, color, revision, created_at AS createdAt, updated_at AS updatedAt";
