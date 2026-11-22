export const runtime = "nodejs";

/** Public runtime configuration. A Google OAuth client ID is not a secret. */
export function GET() {
  return Response.json(
    { googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "" },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
