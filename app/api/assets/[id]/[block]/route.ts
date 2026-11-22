import { auth } from "@/lib/auth";
import { loadAsset } from "@/lib/db";

export const runtime = "nodejs";

/** One book picture, for readers on another device. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; block: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to sync." }, { status: 401 });
  const { id, block } = await params;
  const asset = await loadAsset(userId, id, block);
  if (!asset) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(new Blob([asset.data as Uint8Array<ArrayBuffer>]), {
    headers: { "Content-Type": asset.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
