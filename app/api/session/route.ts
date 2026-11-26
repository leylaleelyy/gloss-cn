import { cookies } from "next/headers";
import { createSession, deleteSession, loadSession, storageConfigured, touchSession } from "@/lib/db";
import { verifyGoogleIdToken } from "@/lib/google";
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  clearedSessionCookieOptions,
  hashSessionToken,
  isSecureRequest,
  looksLikeSessionToken,
  makeSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Returns the active reader from the HttpOnly session cookie, sliding expiry forward when due. */
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const secure = isSecureRequest(req);

  if (!token || !looksLikeSessionToken(token)) {
    return Response.json({ user: null }, { headers: NO_STORE });
  }
  if (!storageConfigured()) {
    return Response.json({ user: null }, { headers: NO_STORE });
  }

  const hash = hashSessionToken(token);
  const record = await loadSession(hash).catch(() => null);
  if (!record) {
    cookieStore.set(SESSION_COOKIE, "", clearedSessionCookieOptions(secure));
    return Response.json({ user: null }, { headers: NO_STORE });
  }

  let expiresAt = record.expiresAt;
  const lastSeen = Date.parse(record.lastSeenAt);
  if (Number.isNaN(lastSeen) || Date.now() - lastSeen > SESSION_REFRESH_AFTER_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await touchSession(hash, expiresAt).catch(() => {});
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(secure));
  }

  return Response.json(
    {
      user: {
        sub: record.userId,
        email: record.email,
        name: record.name,
        ...(record.picture ? { picture: record.picture } : {}),
      },
      expiresAt,
    },
    { headers: NO_STORE }
  );
}

/** Exchanges a freshly verified Google ID token for a 90-day HttpOnly session cookie. */
export async function POST(req: Request) {
  if (!storageConfigured()) {
    return Response.json({ error: "Session storage is not configured.", code: "no_storage" }, { status: 503, headers: NO_STORE });
  }

  let body: { credential?: unknown };
  try {
    body = (await req.json()) as { credential?: unknown };
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400, headers: NO_STORE });
  }

  const credential = typeof body.credential === "string" ? body.credential.trim() : "";
  if (!credential) {
    return Response.json({ error: "Missing credential." }, { status: 400, headers: NO_STORE });
  }

  const verified = await verifyGoogleIdToken(credential).catch(() => null);
  if (!verified) {
    return Response.json({ error: "Invalid or expired Google credential." }, { status: 401, headers: NO_STORE });
  }

  const cookieStore = await cookies();
  const previous = cookieStore.get(SESSION_COOKIE)?.value;
  if (looksLikeSessionToken(previous)) {
    await deleteSession(hashSessionToken(previous)).catch(() => {});
  }

  const { token, hash, expiresAt } = makeSessionToken();
  await createSession(hash, verified, expiresAt);
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(isSecureRequest(req)));

  return Response.json(
    {
      user: {
        sub: verified.userId,
        email: verified.email,
        name: verified.name,
        ...(verified.picture ? { picture: verified.picture } : {}),
      },
      expiresAt,
    },
    { headers: NO_STORE }
  );
}

/** Revokes the current session in D1 and clears the cookie. */
export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (looksLikeSessionToken(token) && storageConfigured()) {
    await deleteSession(hashSessionToken(token)).catch(() => {});
  }
  cookieStore.set(SESSION_COOKIE, "", clearedSessionCookieOptions(isSecureRequest(req)));
  return Response.json({ ok: true }, { headers: NO_STORE });
}
