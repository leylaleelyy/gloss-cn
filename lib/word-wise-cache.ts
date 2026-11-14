'use client';
import { parseWiseWords } from './word-wise-data';
import type { WiseWord } from './word-wise';
const memory = new Map<string, WiseWord[]>();
let opening: Promise<IDBDatabase> | undefined;
function database() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('gloss-word-wise', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('hints', { keyPath: 'key' }).createIndex('savedAt', 'savedAt'); };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); opening = undefined; }; resolve(req.result); };
    req.onerror = () => { opening = undefined; reject(req.error); };
  });
}
function remember(key: string, words: WiseWord[]) {
  memory.delete(key); memory.set(key, words);
  if (memory.size > 500) memory.delete(memory.keys().next().value!);
}
export async function readWiseCache(key: string): Promise<WiseWord[] | undefined> {
  if (memory.has(key)) return memory.get(key);
  try {
    const db = await database();
    const value = await new Promise<{ words: WiseWord[] } | undefined>((resolve, reject) => {
      const req = db.transaction('hints').objectStore('hints').get(key);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const words = parseWiseWords(value?.words);
    if (words !== undefined) { remember(key, words); return words; }
  } catch { /* Keep reading when device storage is unavailable. */ }
  // Preserve definitions written by the previous release.
  try {
    if (typeof caches !== 'undefined') {
      const response = await (await caches.open('gloss-word-wise-v3')).match(key);
      if (response) { const data = await response.json(); const words = parseWiseWords(data?.words); if (words !== undefined) { await writeWiseCache(key, words); return words; } }
    }
  } catch { /* Cache Storage is optional on Safari. */ }
}
export async function writeWiseCache(key: string, words: WiseWord[]) {
  remember(key, words);
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('hints', 'readwrite'), store = tx.objectStore('hints');
      store.put({ key, words, savedAt: Date.now() });
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - 500;
        if (excess <= 0) return;
        const cursor = store.index('savedAt').openCursor();
        cursor.onsuccess = () => { const item = cursor.result; if (item && excess-- > 0) { item.delete(); item.continue(); } };
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } catch { /* Memory still prevents duplicate work during this session. */ }
}
