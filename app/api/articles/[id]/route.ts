import { auth } from "@/lib/auth";
import { articleDoc } from "@/lib/db";

export const runtime = "nodejs";

/**
 * One text from the reader's account, for a device that has the shelf entry but
 * not the text. Short texts are synced; a long book is not here, so this is a
 * 404 and the reader offers to upload the file instead.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to sync." }, { status: 401 });
  const doc = await articleDoc(userId, (await params).id);
  if (!doc) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ doc });
}
