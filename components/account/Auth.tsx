"use client";

import type { ReactNode } from "react";
import { accountsEnabled } from "@/lib/accounts";
import { useGoogleAuth, type GoogleUser } from "@/lib/google-auth";

/** The signed-in reader, as the old account components expect it. */
export function useAuth() {
  const { loaded, user } = useGoogleAuth();
  return { isLoaded: loaded, isSignedIn: Boolean(user), userId: user?.sub ?? null };
}

export function useUser(): { isLoaded: boolean; isSignedIn: boolean; user: (GoogleUser & { firstName: string; fullName: string }) | null } {
  const { loaded, user } = useGoogleAuth();
  const name = user?.name.trim() || user?.email.split("@")[0] || "";
  return {
    isLoaded: loaded,
    isSignedIn: Boolean(user),
    user: user ? { ...user, firstName: name.split(/\s+/)[0] || name, fullName: name } : null,
  };
}

/** `Show` keeps the call sites readable with the Google session. */
export function Show({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) {
  const { loaded, user } = useGoogleAuth();
  if (!loaded) return null;
  return (when === "signed-in") === Boolean(user) ? <>{children}</> : null;
}

/** Any existing "Sign in" control opens the one Google dialog. */
export function SignInButton({ children }: { children: ReactNode; mode?: string }) {
  if (!accountsEnabled) return null;
  return <span className="contents" onClick={() => window.dispatchEvent(new Event("gloss:google-signin"))}>{children}</span>;
}
