import { vocabularyMatcher } from './learning';
import { wiseHints, type WiseEntry, type WiseWord } from './word-wise';

export function createVocabularyProcessor(entries: WiseEntry[]) {
  const match = vocabularyMatcher(entries);
  return {
    matches: (text: string) => match(text),
    hints: (text: string, words: WiseWord[]) => wiseHints(text, words, entries),
  };
}
export type VocabularyProcessor = ReturnType<typeof createVocabularyProcessor>;
export type VocabularyHit = ReturnType<VocabularyProcessor['matches']>[number];
export type VocabularyTask = { type: 'matches'; text: string } | { type: 'hints'; text: string; words: WiseWord[] };
