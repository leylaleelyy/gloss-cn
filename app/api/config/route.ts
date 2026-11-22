import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

/** Public runtime configuration. A Google OAuth client ID is not a secret. */
export function GET() {
  return Response.json(
    { googleClientId: (() => {
      try {
        const value = (getCloudflareContext().env as Record<string, unknown>).GOOGLE_CLIENT_ID;
        if (typeof value === "string" && value) return value;
      } catch {}
      return process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
    })() },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
