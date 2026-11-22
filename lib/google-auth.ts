"use client";

import { create } from "zustand";

export type GoogleUser = { sub: string; email: string; name: string; picture?: string };

type State = {
  loaded: boolean;
  configured: boolean | null;
  credential: string | null;
  user: GoogleUser | null;
};

const KEY = "gloss:google-token";
const SEEN = "gloss:google-seen";

/** Decode a Google JWT's payload. The bytes are UTF-8, so names in any script survive. */
export function decodeGoogleCredential(token: string): GoogleUser | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      sub?: string; email?: string; name?: string; picture?: string; exp?: number; aud?: string; email_verified?: boolean;
    };
    if (!payload.sub || !payload.email || !payload.exp || payload.exp * 1000 <= Date.now()) return null;
    return { sub: payload.sub, email: payload.email, name: payload.name || payload.email.split("@")[0], picture: payload.picture };
  } catch {
    return null;
  }
}

const initial = (): { credential: string | null; user: GoogleUser | null } => {
  try {
    const token = localStorage.getItem(KEY);
    if (!token) return { credential: null, user: null };
    const user = decodeGoogleCredential(token);
    if (user) return { credential: token, user };
    localStorage.removeItem(KEY);
  } catch {}
  return { credential: null, user: null };
};

export const useGoogleAuth = create<State>(() => ({ loaded: false, configured: null, credential: null, user: null }));

/** Read the saved token once, after mount. */
export function initGoogleAuth() {
  if (useGoogleAuth.getState().loaded) return;
  const saved = initial();
  useGoogleAuth.setState({ ...saved, loaded: true });
}

export function setGoogleConfigured(configured: boolean) {
  useGoogleAuth.setState({ configured });
}

export function setGoogleCredential(credential: string) {
  const user = decodeGoogleCredential(credential);
  if (!user) return;
  try { localStorage.setItem(KEY, credential); localStorage.setItem(SEEN, "1"); } catch {}
  useGoogleAuth.setState({ loaded: true, credential, user });
}

export function signOutGoogle() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(SEEN); } catch {}
  useGoogleAuth.setState({ credential: null, user: null, loaded: true });
  try { window.google?.accounts.id.disableAutoSelect(); } catch {}
}

/** A Google authorization happened on this device before, so One Tap may refresh it silently. */
export function googleSeen(): boolean {
  try { return localStorage.getItem(SEEN) === "1"; } catch { return false; }
}

export function promptGoogleRefresh() {
  try { window.google?.accounts.id.prompt(); } catch {}
}

export function googleAuthHeaders(): Record<string, string> {
  const token = useGoogleAuth.getState().credential;
  if (!token) return {};
  if (!decodeGoogleCredential(token)) {
    signOutGoogle();
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

export const openGoogleSignIn = () => window.dispatchEvent(new Event("gloss:google-signin"));

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
