import type { VocabularyEntry } from './learning';
import type { VocabularyHit, VocabularyProcessor, VocabularyTask } from './vocabulary-compute';
import type { WiseEntry, WiseHint, WiseWord } from './word-wise';

const abortError = () => new DOMException('Vocabulary task cancelled', 'AbortError');
type Pending = { task: VocabularyTask; resolve: (value: unknown) => void; reject: (error: unknown) => void; cleanup: () => void; signal?: AbortSignal };

/** One shared worker per notebook snapshot. Sources and book contents are never copied into it. */
class VocabularyComputer {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private disposed = false;
  private local?: Promise<VocabularyProcessor>;
  constructor(private entries: WiseEntry[]) {
    try {
      this.worker = new Worker(new URL('./vocabulary.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onerror = this.worker.onmessageerror = () => this.fallback();
      this.worker.onmessage = ({ data }) => {
        if (data.id === 0 && data.error) { this.fallback(); return; }
        const task = this.pending.get(data.id);
        if (!task) return;
        this.pending.delete(data.id); task.cleanup();
        if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
      };
      this.worker.postMessage({ id: 0, type: 'init', entries });
    } catch { this.worker?.terminate(); this.worker = null; }
  }
  private async runLocal(task: VocabularyTask, signal?: AbortSignal) {
    // Restricted browsers retain the feature. Yield before each paragraph and lazy-load its code.
    await new Promise(resolve => setTimeout(resolve, 0));
    if (this.disposed || signal?.aborted) throw abortError();
    this.local ??= import('./vocabulary-compute').then(m => m.createVocabularyProcessor(this.entries));
    const processor = await this.local;
    if (this.disposed || signal?.aborted) throw abortError();
    return task.type === 'hints' ? processor.hints(task.text, task.words) : processor.matches(task.text);
  }
  private fallback() {
    this.worker?.terminate(); this.worker = null;
    for (const [id, task] of this.pending) {
      this.pending.delete(id); task.cleanup();
      void this.runLocal(task.task, task.signal).then(task.resolve, task.reject);
    }
  }
  private run<T>(task: VocabularyTask, signal?: AbortSignal): Promise<T> {
    if (this.disposed || signal?.aborted) return Promise.reject(abortError());
    if (!this.worker) return this.runLocal(task, signal) as Promise<T>;
    return new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => { const pending = this.pending.get(id); if (!pending) return; this.pending.delete(id); pending.cleanup(); reject(abortError()); };
      const timeout = setTimeout(() => this.fallback(), 15000);
      const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
      this.pending.set(id, { task, resolve: value => resolve(value as T), reject, cleanup, signal });
      signal?.addEventListener('abort', abort, { once: true });
      try { this.worker!.postMessage({ id, ...task }); } catch { this.fallback(); }
    });
  }
  hints(text: string, words: WiseWord[], signal?: AbortSignal) { return this.run<WiseHint[]>({ type: 'hints', text, words }, signal); }
  matches(text: string, signal?: AbortSignal) { return this.run<VocabularyHit[]>({ type: 'matches', text }, signal); }
  dispose() {
    this.disposed = true; this.worker?.terminate(); this.worker = null;
    for (const task of this.pending.values()) { task.cleanup(); task.reject(abortError()); }
    this.pending.clear();
  }
}
const computers = new WeakMap<VocabularyEntry[], { computer: VocabularyComputer; users: number }>();
export function acquireVocabularyComputer(entries: VocabularyEntry[]) {
  let shared = computers.get(entries);
  if (!shared) {
    const slim = entries.map(({ id, word, surface, status, english }) => ({ id, word, surface, status, english }));
    shared = { computer: new VocabularyComputer(slim), users: 0 }; computers.set(entries, shared);
  }
  shared.users++;
  let released = false;
  return { computer: shared.computer, release: () => {
    if (released) return;
    released = true;
    if (--shared.users === 0) { shared.computer.dispose(); computers.delete(entries); }
  } };
}
