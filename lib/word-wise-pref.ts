"use client";

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "gloss:word-wise:";
const EVENT = "gloss:word-wise";

/** Word Wise is remembered per text, and is off until turned on for that text. */
export function wordWiseFor(articleId: string | null): boolean {
  if (!articleId) return false;
  try {
    return localStorage.getItem(PREFIX + articleId) === "1";
  } catch {
    return false;
  }
}

export function setWordWiseFor(articleId: string, on: boolean) {
  try {
    if (on) localStorage.setItem(PREFIX + articleId, "1");
    else localStorage.removeItem(PREFIX + articleId);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useWordWise(articleId: string | null): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const snapshot = useCallback(() => wordWiseFor(articleId), [articleId]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
