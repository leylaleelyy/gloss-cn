"use client";

import { create } from "zustand";

export type SyncState = "off" | "syncing" | "synced" | "error";

/** Shared across the account badge and the sync loop. */
export const useSyncStatus = create<{ state: SyncState; at: number; error: string }>(() => ({ state: "off", at: 0, error: "" }));

export const setSyncStatus = (state: SyncState, error = "") => useSyncStatus.setState({ state, at: Date.now(), error });

/** Ask the running sync to try again now. */
export const requestSync = () => window.dispatchEvent(new Event("gloss:sync-now"));
