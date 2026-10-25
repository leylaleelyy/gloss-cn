"use client";

import {
  ClerkProvider as Provider,
  Show as ClerkShow,
  SignInButton as ClerkSignInButton,
  UserButton as ClerkUserButton,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from "@clerk/nextjs";
import type { ComponentProps } from "react";
import { accountsEnabled } from "@/lib/accounts";

// The choice is fixed for the lifetime of a build, so hook order is stable.
export const useAuth = accountsEnabled ? useClerkAuth : () => ({ isLoaded: true, isSignedIn: false, userId: null });
export const useUser = accountsEnabled ? useClerkUser : () => ({ isLoaded: true, isSignedIn: false, user: null });

export function ClerkProvider(props: ComponentProps<typeof Provider>) {
  return accountsEnabled ? <Provider {...props} /> : <>{props.children}</>;
}

export function Show(props: ComponentProps<typeof ClerkShow>) {
  return accountsEnabled ? <ClerkShow {...props} /> : null;
}

export function SignInButton(props: ComponentProps<typeof ClerkSignInButton>) {
  return accountsEnabled ? <ClerkSignInButton {...props} /> : null;
}

export function UserButton(props: ComponentProps<typeof ClerkUserButton>) {
  return accountsEnabled ? <ClerkUserButton {...props} /> : null;
}
