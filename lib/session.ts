/**
 * Long-lived browser sessions backed by D1 and an HttpOnly cookie.
 * Google Identity Services issues 1-hour ID tokens; on sign-in we verify the
 * Google token once and exchange it for a 90-day opaque session token whose
 * hash lives in D1 and slides forward while the reader stays active.
 */

import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "gloss_session";
export const SESSION_PREFIX = "gse_";
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export const hashSessionToken = (token: string) =>
  createHash("sha256").update(`gloss-session:${token}`).digest("hex");

export function makeSessionToken(): { token: string; hash: string; expiresAt: string } {
  const token = SESSION_PREFIX + randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  return { token, hash: hashSessionToken(token), expiresAt };
}

export const looksLikeSessionToken = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.startsWith(SESSION_PREFIX) && value.length >= 40 && value.length <= 120;

export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return true;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearedSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };
}
