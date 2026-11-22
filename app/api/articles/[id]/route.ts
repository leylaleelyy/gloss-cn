import { auth } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Text bodies are no longer fetched from the account. An imported text lives on
 * the device that imported it; other devices show its synced cards instead.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to sync." }, { status: 401 });
  return Response.json({ error: "The full text stays on the device that imported it." }, { status: 410 });
}
