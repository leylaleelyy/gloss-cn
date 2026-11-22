"use client";

import { create } from "zustand";

export type SyncState = "off" | "syncing" | "synced" | "error";

/** Shared across the account badge and the sync loop. */
export const useSyncStatus = create<{ state: SyncState; at: number }>(() => ({ state: "off", at: 0 }));

export const setSyncStatus = (state: SyncState) => useSyncStatus.setState({ state, at: Date.now() });
