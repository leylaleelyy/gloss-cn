"use client";

import { create } from "zustand";

export type GoogleUser = { sub: string; email: string; name: string; picture?: string };

type State = {
  loaded: boolean;
  sessionChecked: boolean;
  configured: boolean | null;
  credential: string | null;
  user: GoogleUser | null;
};

const KEY = "gloss:google-token";
const USER_KEY = "gloss:session-user";
const SEEN = "gloss:google-seen";

function parseCachedUser(raw: string | null): GoogleUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleUser> & { expiresAt?: string };
    if (!parsed || typeof parsed.sub !== "string" || typeof parsed.email !== "string") return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return {
      sub: parsed.sub,
      email: parsed.email,
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : parsed.email.split("@")[0],
      ...(typeof parsed.picture === "string" && parsed.picture ? { picture: parsed.picture } : {}),
    };
  } catch {
    return null;
  }
}

function saveCachedUser(user: GoogleUser, expiresAt?: string) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({ ...user, ...(expiresAt ? { expiresAt } : {}) }));
    localStorage.setItem(SEEN, "1");
  } catch {}
}

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
    const cached = parseCachedUser(localStorage.getItem(USER_KEY));
    if (cached) return { credential: null, user: cached };
    localStorage.removeItem(USER_KEY);
  } catch {}
  try {
    const token = localStorage.getItem(KEY);
    if (!token) return { credential: null, user: null };
    const user = decodeGoogleCredential(token);
    if (user) return { credential: token, user };
    localStorage.removeItem(KEY);
  } catch {}
  return { credential: null, user: null };
};

export const useGoogleAuth = create<State>(() => ({
  loaded: false,
  sessionChecked: false,
  configured: null,
  credential: null,
  user: null,
}));

/** Read the saved session or legacy token once, after mount. */
export function initGoogleAuth() {
  if (useGoogleAuth.getState().loaded) return;
  const saved = initial();
  useGoogleAuth.setState({ ...saved, loaded: true });
}

export function setGoogleConfigured(configured: boolean) {
  useGoogleAuth.setState({ configured });
}

let authEpoch = 0;

export function setGoogleCredential(credential: string) {
  const user = decodeGoogleCredential(credential);
  if (!user) return;
  authEpoch++;
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.setItem(KEY, credential);
    localStorage.setItem(SEEN, "1");
  } catch {}
  useGoogleAuth.setState({ loaded: true, sessionChecked: true, credential, user });
}

/**
 * Exchange a Google ID token for a 90-day HttpOnly session cookie.
 * Falls back to keeping the Google ID token locally when session storage is unavailable.
 */
export async function exchangeGoogleCredential(credential: string): Promise<boolean> {
  const decoded = decodeGoogleCredential(credential);
  if (!decoded) return false;
  const epoch = ++authEpoch;
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    if (epoch !== authEpoch) return false;
    if (res.ok) {
      const data = (await res.json()) as { user?: GoogleUser; expiresAt?: string };
      if (epoch !== authEpoch) return false;
      const user = data.user ?? decoded;
      try { localStorage.removeItem(KEY); } catch {}
      saveCachedUser(user, data.expiresAt);
      useGoogleAuth.setState({ loaded: true, sessionChecked: true, credential: null, user });
      return true;
    }
    if (res.status === 503) {
      setGoogleCredential(credential);
      return true;
    }
    return false;
  } catch {
    if (epoch !== authEpoch) return false;
    // Offline or transient network error: keep the verified JWT so the user isn't blocked.
    setGoogleCredential(credential);
    return true;
  }
}

let sessionSyncInFlight: Promise<void> | null = null;

/** Confirm and slide-refresh the server HttpOnly session cookie, upgrading any legacy JWT. */
export function syncSession(): Promise<void> {
  if (sessionSyncInFlight) return sessionSyncInFlight;
  const epoch = authEpoch;
  sessionSyncInFlight = (async () => {
    if (!useGoogleAuth.getState().loaded) initGoogleAuth();
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      if (epoch !== authEpoch) return;
      if (!res.ok) {
        useGoogleAuth.setState({ loaded: true, sessionChecked: true });
        return;
      }
      const data = (await res.json()) as { user?: GoogleUser | null; expiresAt?: string };
      if (epoch !== authEpoch) return;
      if (data.user) {
        try { localStorage.removeItem(KEY); } catch {}
        saveCachedUser(data.user, data.expiresAt);
        useGoogleAuth.setState({ loaded: true, sessionChecked: true, credential: null, user: data.user });
        return;
      }

      // No server cookie yet. If a legacy 1-hour JWT is still valid locally, try to upgrade it.
      const legacyToken = useGoogleAuth.getState().credential;
      if (legacyToken && decodeGoogleCredential(legacyToken)) {
        const upgraded = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: legacyToken }),
        }).catch(() => null);
        if (epoch !== authEpoch) return;
        if (upgraded?.ok) {
          const upgradedData = (await upgraded.json()) as { user?: GoogleUser; expiresAt?: string };
          if (epoch !== authEpoch) return;
          if (upgradedData.user) {
            try { localStorage.removeItem(KEY); } catch {}
            saveCachedUser(upgradedData.user, upgradedData.expiresAt);
            useGoogleAuth.setState({ loaded: true, sessionChecked: true, credential: null, user: upgradedData.user });
            return;
          }
        }
        useGoogleAuth.setState({ loaded: true, sessionChecked: true });
        return;
      }

      // Server confirmed no active session; clear stale cached session profile.
      try {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(KEY);
      } catch {}
      useGoogleAuth.setState({ loaded: true, sessionChecked: true, credential: null, user: null });
    } catch {
      if (epoch !== authEpoch) return;
      // Offline: preserve the cached user profile until the network returns.
      useGoogleAuth.setState({ loaded: true, sessionChecked: true });
    } finally {
      sessionSyncInFlight = null;
    }
  })();
  return sessionSyncInFlight;
}

export function signOutGoogle() {
  authEpoch++;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SEEN);
  } catch {}
  useGoogleAuth.setState({ credential: null, user: null, loaded: true, sessionChecked: true });
  void fetch("/api/session", { method: "DELETE" }).catch(() => {});
  try { window.google?.accounts.id.disableAutoSelect(); } catch {}
}

/** An expired session or JWT drops local state while keeping SEEN, so One Tap can silently refresh it. */
export function expireGoogleCredential() {
  authEpoch++;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
  useGoogleAuth.setState({ credential: null, user: null, loaded: true, sessionChecked: true });
  promptGoogleRefresh();
}

/** A Google authorization happened on this device before, so One Tap may refresh it silently. */
export function googleSeen(): boolean {
  try { return localStorage.getItem(SEEN) === "1"; } catch { return false; }
}

export function promptGoogleRefresh() {
  try { window.google?.accounts.id.prompt(); } catch {}
}

export function googleAuthHeaders(): Record<string, string> {
  if (!useGoogleAuth.getState().loaded) initGoogleAuth();
  const token = useGoogleAuth.getState().credential;
  if (!token) return {};
  if (!decodeGoogleCredential(token)) {
    expireGoogleCredential();
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
