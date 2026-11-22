"use client";

/**
 * Books the reader removed on this device. Only these become article tombstones
 * on the server; a shelf that failed to load must never delete the library.
 */
const KEY = "gloss:sync-deleted-articles";

function read(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function write(ids: Set<string>) {
  try {
    if (ids.size) localStorage.setItem(KEY, JSON.stringify([...ids]));
    else localStorage.removeItem(KEY);
  } catch {}
}

export function markArticleDeleted(id: string) {
  const ids = read();
  if (ids.has(id)) return;
  ids.add(id);
  write(ids);
}

export function pendingArticleDeletions(): Set<string> {
  return read();
}

export function clearArticleDeletions(ids: Iterable<string>) {
  const pending = read();
  let changed = false;
  for (const id of ids) changed = pending.delete(id) || changed;
  if (changed) write(pending);
}
