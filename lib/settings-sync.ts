"use client";

import { applySettings, cleanSyncedSettings, syncedSettings, type Settings } from "./settings";
import { useStore } from "./store";

type RemoteSettings = { id: string; data: Partial<Settings> | null; deleted: boolean };

/** What this device would push for the settings collection. */
export const localSyncedSettings = () => syncedSettings(useStore.getState().settings);

/** The account's settings, merged over this device's local ones. Device-only fields stay put. */
export function applyRemoteSettings(rows: RemoteSettings[] = []) {
  const row = rows.find((item) => item.id === "preferences");
  if (!row || row.deleted || !row.data) return;
  const patch = cleanSyncedSettings(row.data);
  if (!Object.keys(patch).length) return;
  useStore.getState().setSettings(patch);
  applySettings(useStore.getState().settings);
}
