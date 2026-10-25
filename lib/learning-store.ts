"use client";
import { create } from "zustand";
import { DEFAULT_LEARNING, learningPreferences, normalizeWord, type LearningPreferences, type Definition, type WordSource, type VocabularyEntry } from "./learning";
const KEY = "gloss:learning-settings";
let opening: Promise<IDBDatabase> | undefined;
function db() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("gloss-learning", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("vocabulary", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result); r.onerror = () => { opening = undefined; reject(r.error); };
  });
}
async function write(value: VocabularyEntry | string) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("vocabulary", "readwrite"), s = t.objectStore("vocabulary");
    if (typeof value === "string") s.delete(value); else s.put(value);
    t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
}
let hydration: Promise<void> | undefined;
export const useLearning = create<{ entries: VocabularyEntry[]; preferences: LearningPreferences; ready: boolean; error: string }>(() => ({ entries: [], preferences: DEFAULT_LEARNING, ready: false, error: "" }));
export function hydrateLearning() {
  return hydration ??= (async () => {
    try {
      let preferences = DEFAULT_LEARNING;
      try { preferences = learningPreferences(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* Recover malformed preferences without losing vocabulary access. */ }
      const d = await db();
      const entries = await new Promise<VocabularyEntry[]>((resolve, reject) => { const r = d.transaction("vocabulary").objectStore("vocabulary").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      useLearning.setState({ entries, preferences, ready: true, error: "" });
    } catch { hydration = undefined; useLearning.setState({ ready: true, error: "Could not open vocabulary storage. Please reopen Gloss before saving words." }); }
  })();
}
export function setLearning(patch: Partial<LearningPreferences>) {
  const preferences = learningPreferences({ ...useLearning.getState().preferences, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); useLearning.setState({ preferences, error: "" }); }
  catch { useLearning.setState({ error: "Could not save learning preferences. Device storage may be full." }); }
}
// Serialize saves so rapid clicks cannot create duplicates or drop a source.
let pending: Promise<unknown> = Promise.resolve();
function serialized<T>(job: () => Promise<T>): Promise<T> {
  const next = pending.then(job, job); pending = next.catch(() => {}); return next;
}
export function saveWord(d: Definition, source: WordSource, surface = d.word) {
  return serialized(async () => {
    await hydrateLearning();
    if (useLearning.getState().error) throw new Error(useLearning.getState().error);
    const entries = useLearning.getState().entries;
    const old = entries.find(x => normalizeWord(x.word) === normalizeWord(d.word) && normalizeWord(x.english) === normalizeWord(d.english));
    const sources = old?.sources ?? [];
    const next: VocabularyEntry = { ...d, id: old?.id ?? crypto.randomUUID(), surface, status: old?.status ?? "new", sources: sources.some(s => s.articleId === source.articleId && s.blockId === source.blockId && s.quote === source.quote) ? sources : [...sources, source], createdAt: old?.createdAt ?? Date.now(), updatedAt: Date.now() };
    await write(next);
    useLearning.setState(s => ({ entries: old ? s.entries.map(x => x.id === old.id ? next : x) : [next, ...s.entries] }));
    return next.id;
  });
}
export function updateWord(id: string, status: VocabularyEntry["status"]) {
  return serialized(async () => {
    const old = useLearning.getState().entries.find(x => x.id === id); if (!old) return;
    const next = { ...old, status, updatedAt: Date.now() }; await write(next);
    useLearning.setState(s => ({ entries: s.entries.map(x => x.id === id ? next : x) }));
  });
}
export function removeWord(id: string) {
  return serialized(async () => { await write(id); useLearning.setState(s => ({ entries: s.entries.filter(x => x.id !== id) })); });
}
