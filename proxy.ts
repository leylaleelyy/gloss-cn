import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { accountsEnabled } from "@/lib/accounts";

// Signing in is optional: nothing is protected here. Routes that need a user check auth() themselves.
const clerk = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return accountsEnabled ? clerk(request, event) : NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!desktop-transfer|_next|[^?]*\\.(?:html?|css|js(?!on)|mjs|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
