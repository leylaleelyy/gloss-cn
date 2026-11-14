import { vocabularyMatcher, type VocabularyEntry } from './learning';
export type WiseEntry = Pick<VocabularyEntry, "id" | "word" | "surface" | "status" | "english">;
export type WiseWord = { word: string; meaning: string; short?: string };
export type WiseHint = { from: number; to: number; meaning: string; short?: string };
// Compile the notebook once per immutable entries snapshot, not twice per paragraph.
const matchers = new WeakMap<WiseEntry[], { mastered: ReturnType<typeof vocabularyMatcher>; notebook: ReturnType<typeof vocabularyMatcher>; meanings: Map<string, string> }>();
function notebookMatchers(entries: WiseEntry[]) {
  let cached = matchers.get(entries);
  if (!cached) {
    cached = {
      mastered: vocabularyMatcher(entries.filter(e => e.status === 'mastered').map(e => ({ ...e, status: 'new' }))),
      notebook: vocabularyMatcher(entries),
      meanings: new Map(entries.map(e => [e.id, e.english])),
    };
    matchers.set(entries, cached);
  }
  return cached;
}
/** Reject long sentences instead of chopping them into misleading fragments. */
export function shortWiseHint(value: string | undefined): string | undefined {
  const text = value?.trim().replace(/\s+/g, ' ');
  return text && text.length <= 24 && /^[\p{L}\p{M}'’-]+(?: [\p{L}\p{M}'’-]+)?$/u.test(text) ? text : undefined;
}
export function wiseHints(text: string, words: WiseWord[], entries: WiseEntry[]): WiseHint[] {
  const cached = notebookMatchers(entries);
  const mastered = cached.mastered(text);
  const notebook = cached.notebook(text).map(hit => ({ ...hit, meaning: cached.meanings.get(hit.id)! }));
  const ai = vocabularyMatcher(words.map((w, i) => ({ word: w.word, surface: w.word, status: 'new', id: String(i) })))(text).map(hit => ({ ...hit, meaning: words[Number(hit.id)].meaning, short: shortWiseHint(words[Number(hit.id)].short ?? words[Number(hit.id)].meaning) }));
  const result: WiseHint[] = [];
  for (const h of [...notebook, ...ai]) {
    if (!h.meaning || mastered.some(m => m.from < h.to && m.to > h.from) || result.some(m => m.from < h.to && m.to > h.from)) continue;
    const short = ai.find(a => a.from === h.from && a.to === h.to)?.short ?? shortWiseHint(h.meaning);
    result.push({ from: h.from, to: h.to, meaning: h.meaning, ...(short ? { short } : {}) });
  }
  return result.sort((a, b) => a.from - b.from);
}
