import { auth } from "@/lib/auth";
import { d1 } from "@/lib/db";

export const runtime = "nodejs";

const MAX_CHUNK = 900_000;
const MAX_CHUNKS = 200;

/** One slice of a gzipped, base64 book text. Large EPUBs upload in several of these. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to sync." }, { status: 401 });
  const articleId = (await params).id;
  let body: { seq?: unknown; total?: unknown; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const seq = Number(body.seq);
  const total = Number(body.total);
  const data = body.data;
  if (!Number.isInteger(seq) || seq < 0 || !Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) return Response.json({ error: "Invalid chunk." }, { status: 400 });
  if (seq >= total || typeof data !== "string" || !data || data.length > MAX_CHUNK || !/^[A-Za-z0-9+/=]+$/.test(data)) return Response.json({ error: "Invalid chunk data." }, { status: 400 });

  const db = d1();
  if (seq === 0) await db.prepare("delete from article_docs where user_id = ? and article_id = ?").bind(userId, articleId).run();
  await db
    .prepare(
      `insert into article_docs (user_id, article_id, seq, data, updated_at) values (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       on conflict (user_id, article_id, seq) do update set data = excluded.data, updated_at = excluded.updated_at`
    )
    .bind(userId, articleId, seq, data)
    .run();
  return Response.json({ ok: true });
}
