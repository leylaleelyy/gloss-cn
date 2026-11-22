import { headers } from "next/headers";
import { verifyGoogleIdToken } from "./google";

export type Reader = { userId: string | null; email?: string; name?: string; picture?: string };

/** Signed-in readers prove who they are with a Google ID token on each request. */
export async function auth(): Promise<Reader> {
  const token = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { userId: null };
  const user = await verifyGoogleIdToken(token).catch(() => null);
  return user ? { userId: user.userId, email: user.email, name: user.name, picture: user.picture } : { userId: null };
}
