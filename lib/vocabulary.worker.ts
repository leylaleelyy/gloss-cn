import { createVocabularyProcessor, type VocabularyProcessor, type VocabularyTask } from './vocabulary-compute';
import type { WiseEntry } from './word-wise';
let processor: VocabularyProcessor | undefined;
self.onmessage = ({ data }: MessageEvent<{ id: number } & (VocabularyTask | { type: 'init'; entries: WiseEntry[] })>) => {
  try {
    if (data.type === 'init') { processor = createVocabularyProcessor(data.entries); return; }
    if (!processor) throw new Error('Vocabulary worker is not initialized');
    const result = data.type === 'hints' ? processor.hints(data.text, data.words) : processor.matches(data.text);
    self.postMessage({ id: data.id, result });
  } catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }); }
};
