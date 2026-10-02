import { failure, publicFields, sameOrigin, storage, validScene } from "@/lib/board-store";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Context) {
  try {
    const { id } = await ctx.params; const { db, bucket } = storage();
    const board: any = await db.prepare(`SELECT ${publicFields}, scene_key FROM boards WHERE id = ?`).bind(id).first();
    if (!board) return Response.json({ error: "Board not found" }, { status: 404 });
    const object = await bucket.get(board.scene_key);
    if (!object) throw new Error("Missing board scene");
    delete board.scene_key;
    return Response.json({ board, scene: await object.json() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(req: Request, ctx: Context) {
  if (!sameOrigin(req)) return Response.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const { id } = await ctx.params; const raw = await req.text();
    if (raw.length > 15000000) return Response.json({ error: "Board exceeds 15 MB. Export a backup and reduce image sizes." }, { status: 413 });
    let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid drawing" }, { status: 400 }); }
    if (!body || !validScene(body.scene) || !Number.isInteger(body.revision)) return Response.json({ error: "Invalid drawing" }, { status: 400 });
    const { db, bucket } = storage();
    const previous: any = await db.prepare("SELECT scene_key, revision FROM boards WHERE id = ?").bind(id).first();
    if (!previous) return Response.json({ error: "Board not found" }, { status: 404 });
    if (previous.revision !== body.revision) return Response.json({ error: "This board was changed in another tab. Save a copy to keep your drawing." }, { status: 409 });
    const key = `boards/${id}/${crypto.randomUUID()}.json`;
    await bucket.put(key, JSON.stringify(body.scene), { httpMetadata: { contentType: "application/json" } });
    const updatedAt = new Date().toISOString();
    const result = await db.prepare("UPDATE boards SET scene_key = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?").bind(key, updatedAt, id, body.revision).run();
    if (!result.meta.changes) { await bucket.delete(key); return Response.json({ error: "This board changed in another tab. Save a copy to preserve your edits." }, { status: 409 }); }
    await bucket.delete(previous.scene_key).catch(e => console.error("Old snapshot cleanup", e));
    return Response.json({ revision: body.revision + 1, updatedAt });
  } catch (error) { return failure(error); }
}
export async function PATCH(req: Request, ctx: Context) {
  if (!sameOrigin(req)) return Response.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const { id } = await ctx.params; let body: any;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid update" }, { status: 400 }); }
    if (!body || typeof body !== "object") return Response.json({ error: "Invalid update" }, { status: 400 });
    const { db } = storage();
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 120) return Response.json({ error: "Use a name of 1–120 characters." }, { status: 400 });
      await db.prepare("UPDATE boards SET title = ? WHERE id = ?").bind(body.title.trim(), id).run();
    }
    if (typeof body.favorite === "boolean") await db.prepare("UPDATE boards SET favorite = ? WHERE id = ?").bind(Number(body.favorite), id).run();
    const board = await db.prepare(`SELECT ${publicFields} FROM boards WHERE id = ?`).bind(id).first();
    return board ? Response.json(board) : Response.json({ error: "Board not found" }, { status: 404 });
  } catch (error) { return failure(error); }
}
export async function DELETE(req: Request, ctx: Context) {
  if (!sameOrigin(req)) return Response.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const { id } = await ctx.params; const { db, bucket } = storage();
    await db.prepare("DELETE FROM boards WHERE id = ?").bind(id).run();
    const files = await bucket.list({ prefix: `boards/${id}/`, limit: 1000 });
    if (files.objects.length) await bucket.delete(files.objects.map(o => o.key));
    return Response.json({ deleted: true });
  } catch (error) { return failure(error); }
}
