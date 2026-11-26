import { NextResponse, type NextRequest } from "next/server";

// Accounts, when enabled, are verified per API request with the long-lived
// HttpOnly session cookie (or a Google ID token). Nothing is protected at the edge.
export default function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!desktop-transfer|_next|[^?]*\\.(?:html?|css|js(?!on)|mjs|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
