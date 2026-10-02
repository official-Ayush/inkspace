import { failure, publicFields, sameOrigin, storage, validScene } from "@/lib/board-store";
export async function GET() {
  try {
    const { db } = storage();
    const { results } = await db.prepare(`SELECT ${publicFields} FROM boards ORDER BY updated_at DESC`).all();
    return Response.json({ boards: results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 15000000) return Response.json({ error: "Board is too large. Keep images below 10 MB in total." }, { status: 413 });
    let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid board file" }, { status: 400 }); }
    if (!body || !validScene(body.scene) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 120) return Response.json({ error: "A board needs a name and a valid drawing." }, { status: 400 });
    const { db, bucket } = storage(); const id = crypto.randomUUID(); const now = new Date().toISOString();
    const key = `boards/${id}/${crypto.randomUUID()}.json`;
    const color = /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : "#ffd76a";
    await bucket.put(key, JSON.stringify(body.scene), { httpMetadata: { contentType: "application/json" } });
    try { await db.prepare("INSERT INTO boards (id, title, color, scene_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, body.title.trim(), color, key, now, now).run(); }
    catch (e) { await bucket.delete(key); throw e; }
    return Response.json({ id, title: body.title.trim(), favorite: 0, color, revision: 1, createdAt: now, updatedAt: now }, { status: 201 });
  } catch (error) { return failure(error); }
}
