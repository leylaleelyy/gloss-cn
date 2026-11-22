"use client";

import { create } from "zustand";

type Request = { articles: number; total: number; resolve: (ok: boolean) => void };

/** A sync pass waiting for the reader to approve a large deletion. */
export const useSyncGuard = create<{ request: Request | null }>(() => ({ request: null }));

export function confirmSyncDeletions(articles: number, total: number): Promise<boolean> {
  return new Promise((resolve) => useSyncGuard.setState({ request: { articles, total, resolve } }));
}

export function answerSyncGuard(ok: boolean) {
  const request = useSyncGuard.getState().request;
  if (!request) return;
  useSyncGuard.setState({ request: null });
  request.resolve(ok);
}
