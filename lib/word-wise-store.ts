import type { WiseHint } from './word-wise';

/** Notify only the paragraph that changed; a book may have thousands of subscribers. */
const hints = new Map<string, WiseHint[]>();
const listeners = new Map<string, Set<() => void>>();
export const getWiseHints = (id: string) => hints.get(id);
export function subscribeWiseHints(id: string, listener: () => void) {
  let list = listeners.get(id);
  if (!list) listeners.set(id, list = new Set());
  list.add(listener);
  return () => { list.delete(listener); if (!list.size) listeners.delete(id); };
}
export function setWiseHints(id: string, next: WiseHint[]) {
  const previous = hints.get(id);
  if ((!previous && !next.length) || (previous?.length === next.length && previous.every((h, i) => h.from === next[i].from && h.to === next[i].to && h.meaning === next[i].meaning && h.short === next[i].short))) return;
  hints.set(id, next);
  listeners.get(id)?.forEach(notify => notify());
}
export function clearWiseHints() {
  const changed = [...hints.keys()];
  hints.clear();
  for (const id of changed) listeners.get(id)?.forEach(notify => notify());
}
