import { auth } from "@/lib/auth";
import { saveAsset } from "@/lib/db";

export const runtime = "nodejs";

/** A book picture, sent as base64 from the importing device. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to sync." }, { status: 401 });
  let body: { articleId?: unknown; id?: unknown; mime?: unknown; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const articleId = typeof body.articleId === "string" ? body.articleId.slice(0, 120) : "";
  const id = typeof body.id === "string" ? body.id.slice(0, 120) : "";
  const mime = typeof body.mime === "string" && /^image\/(png|jpeg|webp|gif)$/.test(body.mime) ? body.mime : "";
  const data = typeof body.data === "string" ? body.data : "";
  if (!articleId || !id || !mime || !data || data.length > 1_800_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return Response.json({ error: "Invalid picture." }, { status: 400 });
  try {
    await saveAsset(userId, articleId, id, mime, data);
  } catch {
    return Response.json({ error: "Could not store that picture." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
