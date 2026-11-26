import { cookies, headers } from "next/headers";
import { loadSession, storageConfigured, touchSession } from "./db";
import { verifyGoogleIdToken } from "./google";
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  hashSessionToken,
  looksLikeSessionToken,
} from "./session";

export type Reader = { userId: string | null; email?: string; name?: string; picture?: string };

async function resolveSessionToken(token: string): Promise<Reader | null> {
  if (!looksLikeSessionToken(token) || !storageConfigured()) return null;
  const hash = hashSessionToken(token);
  const record = await loadSession(hash).catch(() => null);
  if (!record) return null;
  const lastSeen = Date.parse(record.lastSeenAt);
  if (Number.isNaN(lastSeen) || Date.now() - lastSeen > SESSION_REFRESH_AFTER_MS) {
    const nextExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await touchSession(hash, nextExpiry).catch(() => {});
  }
  return { userId: record.userId, email: record.email, name: record.name, picture: record.picture };
}

/**
 * Signed-in readers prove who they are with either the long-lived HttpOnly
 * session cookie or a Bearer token (session token or Google ID token).
 */
export async function auth(): Promise<Reader> {
  const cookieToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const reader = await resolveSessionToken(cookieToken);
    if (reader) return reader;
  }

  const token = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { userId: null };
  if (looksLikeSessionToken(token)) {
    return (await resolveSessionToken(token)) ?? { userId: null };
  }
  const user = await verifyGoogleIdToken(token).catch(() => null);
  return user ? { userId: user.userId, email: user.email, name: user.name, picture: user.picture } : { userId: null };
}
