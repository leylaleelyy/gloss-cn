/**
 * Google ID token verification, server-side only. No client secret is needed:
 * the browser receives a signed JWT from Google Identity Services, and this
 * checks it against Google's published keys and our client id.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

type GoogleClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  exp?: number;
  email_verified?: boolean;
};

type Jwk = JsonWebKey & { kid?: string };
let keys: { at: number; value: Jwk[] } | null = null;

async function googleKeys(): Promise<Jwk[]> {
  if (keys && Date.now() - keys.at < 3_600_000) return keys.value;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not fetch Google keys.");
  const body = (await res.json()) as { keys?: Jwk[] };
  keys = { at: Date.now(), value: body.keys ?? [] };
  return keys.value;
}

const bytes = (text: string) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

/** A verified reader, or null for a missing, malformed, expired or foreign token. */
export async function verifyGoogleIdToken(token: string): Promise<{ userId: string; email: string; name: string; picture?: string } | null> {
  let clientId = "";
  try {
    const value = (getCloudflareContext().env as Record<string, unknown>).GOOGLE_CLIENT_ID;
    if (typeof value === "string") clientId = value;
  } catch {}
  clientId ||= process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  if (!clientId) return null;
  const [head, payload, signature] = token.split(".");
  if (!head || !payload || !signature) return null;

  let header: { alg?: string; kid?: string };
  let claims: GoogleClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes(head))) as { alg?: string; kid?: string };
    claims = JSON.parse(new TextDecoder().decode(bytes(payload))) as GoogleClaims;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") return null;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) return null;
  if (!claims.sub || !claims.email || !claims.exp || claims.exp * 1000 <= Date.now()) return null;
  if (claims.email_verified === false) return null;

  const jwk = (await googleKeys()).find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(signature), new TextEncoder().encode(`${head}.${payload}`));
  if (!valid) return null;

  return { userId: claims.sub, email: claims.email, name: claims.name || claims.email.split("@")[0], ...(claims.picture ? { picture: claims.picture } : {}) };
}
