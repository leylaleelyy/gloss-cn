import type { WiseWord } from './word-wise';

/** Disk cache and provider output are untrusted JSON, not typed Word Wise records. */
export function parseWiseWords(value: unknown): WiseWord[] | undefined {
  if (!Array.isArray(value) || value.length > 48) return undefined;
  const result: WiseWord[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.word !== 'string' || typeof item.meaning !== 'string') return undefined;
    const word = item.word.trim(), meaning = item.meaning.trim();
    if (!word || word.length > 100 || !meaning || meaning.length > 2000 || (item.short !== undefined && typeof item.short !== 'string')) return undefined;
    result.push({ word, meaning, ...(item.short ? { short: item.short.trim().slice(0, 100) } : {}) });
  }
  return result;
}
