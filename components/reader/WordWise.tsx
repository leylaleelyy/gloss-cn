'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clearWiseHints, getWiseHints, setWiseHints, subscribeWiseHints } from '@/lib/word-wise-store';
import { create } from 'zustand';
import { useLearning, setLearning } from '@/lib/learning-store';
import { LEVELS } from '@/lib/learning';
import { readProvider } from '@/lib/provider-config';
import { loadWiseWords, loadWiseWordsBatch } from '@/lib/word-wise-source';
import { type WiseWord } from '@/lib/word-wise';
import { useReader } from './context';
import { BookA, ChevronDown, Check, LoaderCircle, AlertCircle } from 'lucide-react';
import { acquireVocabularyComputer } from '@/lib/vocabulary-worker';
import { observeInlineWiseHints } from '@/lib/word-wise-layout';
import { startGloss } from '@/lib/ask';
import { useStore } from '@/lib/store';
import { setWordWiseFor, useWordWise } from '@/lib/word-wise-pref';
import { Popover, barBtn } from '@/components/ui/Popover';
import { useI18n } from '@/lib/ui-lang';
const useWise = create<{ error: string; loading: boolean }>(() => ({ error: '', loading: false }));
const serverHints = () => undefined;
export function useWiseHints(id: string) {
  return useSyncExternalStore(useCallback(listener => subscribeWiseHints(id, listener), [id]), useCallback(() => getWiseHints(id), [id]), serverHints);
}
export function WordWiseControl() {
  const { ix } = useReader();
  const p = useLearning(s => s.preferences);
  const on = useWordWise(ix.article.id);
  const error = useWise(s => s.error);
  const loading = useWise(s => s.loading);
  const { t } = useI18n();
  const descriptions = t('wordwise.levels').split('|');
  return <div className="word-wise-controls flex shrink-0 items-center">
    <button type="button" className={`${barBtn} word-wise-toggle`} aria-label={t('wordwise.label')} aria-pressed={on}
      data-tip={on ? t('wordwise.off') : t('wordwise.on')} onClick={() => setWordWiseFor(ix.article.id, !on)}>
      {loading ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : error && on ? <AlertCircle size={18} aria-hidden /> : <BookA size={18} strokeWidth={1.8} aria-hidden />}
      <span className="toolbar-label">{t('wordwise.label')}</span>
    </button>
    {on && <Popover label={t('wordwise.levelLabel')} tip={t('wordwise.levelTip')} triggerClass={`${barBtn} word-wise-level`} width={288}
      trigger={<><span className="tabular-nums text-xs">{p.level}</span><ChevronDown size={12} aria-hidden /></>}>
      {close => <div>
        <p className="text-sm font-medium text-ink">{t('wordwise.levelTip')}</p>
        <p className="mt-1 mb-1 text-xs leading-relaxed text-ink-3">{t('wordwise.help')}</p>
        <p className="mb-3 text-xs leading-relaxed text-ink-4">{t('wordwise.perBook')}</p>
        <div role="group" aria-label={t('wordwise.group')} className="grid gap-1">
          {LEVELS.map((level, i) => <button key={level} type="button" aria-pressed={p.level === level}
            className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${p.level === level ? 'bg-sunk text-ink' : 'text-ink-2 hover:bg-sunk'}`}
            onClick={() => { setLearning({ level }); close(); }}>
            <span className="w-6 text-sm font-medium tabular-nums">{level}</span><span className="flex-1 text-xs">{descriptions[i]}</span>{p.level === level && <Check size={16} className="text-rubric" aria-hidden />}
          </button>)}
        </div>
        {loading && <p role="status" className="mt-3 text-xs text-ink-3">{t('wordwise.generating')}</p>}
        {error && <div role="status" className="mt-3 border-t border-rule pt-3"><p className="text-xs leading-relaxed text-ink-3">{error}</p><button type="button" className="mt-2 text-xs font-medium text-rubric" onClick={() => window.dispatchEvent(new Event('gloss:provider'))}>{t('wordwise.retry')}</button></div>}
      </div>}
    </Popover>}
  </div>;
}
function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length, h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function WordWise({ root }: { root: HTMLElement | null }) {
  const { ix } = useReader();
  const prefs = useLearning(s => s.preferences);
  const entries = useLearning(s => s.entries);
  const ready = useLearning(s => s.ready);
  const on = useWordWise(ix.article.id);
  const [revision, setRevision] = useState(0);
  const computerRef = useRef<ReturnType<typeof acquireVocabularyComputer>['computer'] | null>(null);
  const rehintRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!on || !root || !ready) { computerRef.current = null; return; }
    const { computer, release } = acquireVocabularyComputer(entries);
    computerRef.current = computer;
    rehintRef.current?.();
    return () => {
      if (computerRef.current === computer) computerRef.current = null;
      release();
    };
  }, [on, root, ready, entries]);
  useEffect(() => {
    if (!root || !on) return;
    const open = (event: MouseEvent | KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const mark = target?.closest<HTMLElement>('[data-wise-from]');
      if (!mark || target?.closest('a')) return;
      if (event instanceof MouseEvent && (event.button !== 0 || event.detail > 1 || !window.getSelection()?.isCollapsed)) return;
      if (event instanceof KeyboardEvent && (event.key !== 'Enter' && event.key !== ' ')) return;
      const blockId = mark.closest<HTMLElement>('[data-block]')?.dataset.block;
      if (!blockId) return;
      const from = Number(mark.dataset.wiseFrom), to = Number(mark.dataset.wiseTo);
      const hint = getWiseHints(blockId)?.find(h => h.from === from && h.to === to);
      if (!hint) return;
      event.preventDefault(); event.stopPropagation();
      const anchor = { start: { b: blockId, o: from }, end: { b: blockId, o: to }, quote: (ix.texts.get(blockId) ?? '').slice(from, to) };
      const existing = (useStore.getState().glosses[ix.article.id] ?? []).find(g => g.action === 'define' && g.anchor?.start.b === blockId && g.anchor.start.o === from && g.anchor.end.b === blockId && g.anchor.end.o === to);
      if (existing) useStore.getState().setUI({ activeGloss: existing.id, activeHighlight: null, focusMode: false });
      else startGloss(ix, { anchor, action: 'define' });
    };
    root.addEventListener('click', open, true);
    root.addEventListener('keydown', open, true);
    return () => { root.removeEventListener('click', open, true); root.removeEventListener('keydown', open, true); };
  }, [root, ix, on]);
  useLayoutEffect(() => {
    if (!root || !on) return;
    root.dataset.wiseInline = 'true';
    const dispose = observeInlineWiseHints(root);
    return () => { delete root.dataset.wiseInline; dispose(); };
  }, [root, on]);
  useEffect(() => { const retry = () => setRevision(n => n + 1); window.addEventListener('gloss:provider', retry); window.addEventListener('online', retry); return () => { window.removeEventListener('gloss:provider', retry); window.removeEventListener('online', retry); }; }, []);
  useEffect(() => {
    clearWiseHints();
    useWise.setState({ error: '', loading: false });
    if (!on || !root || !ready) return;
    let stopped = false, busy = false, failed = false;
    const controller = new AbortController(), visible = new Set<string>(), done = new Set<string>();
    const positions = new Map<string, number>();
    let lastScroll = 0;
    const onScroll = () => { lastScroll = performance.now(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    const progress = new Map<string, { offset: number; words: WiseWord[] }>();
    const blocks = new Map(ix.article.blocks.map(b => [b.id, b]));
    let timer: ReturnType<typeof setTimeout>;
    const apply = async (id: string, text: string, words: WiseWord[]) => {
      const computer = computerRef.current;
      if (!computer) return;
      const hints = await computer.hints(text, words, controller.signal);
      if (!stopped) setWiseHints(id, hints);
    };
    rehintRef.current = () => {
      for (const id of visible) {
        const block = blocks.get(id);
        if (!block) continue;
        const fullText = block.runs.map(r => r.text).join('');
        void apply(id, fullText, progress.get(id)?.words ?? []).catch(() => {});
      }
    };
    const BATCH = 4;
    const cacheKey = async (text: string) => {
      const provider = readProvider();
      const raw = `v4:${provider.baseUrl}:${provider.model}:${prefs.level}:${text}`;
      let hex: string;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      } else {
        hex = `f-${fallbackHash(raw)}`;
      }
      return new URL('/__word-wise/' + hex, location.origin).href;
    };
    const pump = async () => {
      if (stopped || busy) return;
      // Let touch scrolling settle before updating text layout. Fetch nearby text first.
      if (performance.now() - lastScroll < 120) { timer = setTimeout(pump, 120); return; }
      const center = window.scrollY + window.innerHeight / 2;
      const ids = [...visible].filter(id => !done.has(id)).sort((a, b) => Math.abs((positions.get(a) ?? center) - center) - Math.abs((positions.get(b) ?? center) - center)).slice(0, BATCH);
      if (!ids.length) return;
      const jobs = ids.flatMap(id => {
        const block = blocks.get(id); if (!block) return [];
        const fullText = block.runs.map(r => r.text).join('');
        const part = progress.get(id) ?? { offset: 0, words: [] };
        let end = Math.min(fullText.length, part.offset + 5000);
        if (end < fullText.length) { const boundary = fullText.lastIndexOf(' ', end); if (boundary > part.offset) end = boundary; }
        return [{ id, fullText, part, end, text: fullText.slice(part.offset, end) }];
      });
      if (!jobs.length) return;
      for (const job of jobs) done.add(job.id);
      busy = true;
      try {
        for (const job of jobs) await apply(job.id, job.fullText, job.part.words);
        const needs = jobs.filter(job => /[a-zA-Z]{3}/.test(job.text));
        const items = await Promise.all(needs.map(async job => ({ ...job, key: await cacheKey(job.text) })));
        if (items.length) {
          const found = await loadWiseWordsBatch(items.map(({ key, text }) => ({ key, text })), prefs.level, controller.signal, !failed, () => useWise.setState({ loading: true }));
          if (stopped) return;
          for (const job of items) {
            const words = found.get(job.key);
            if (words !== undefined) {
              job.part.words.push(...words);
              progress.set(job.id, { offset: job.end, words: job.part.words });
              await apply(job.id, job.fullText, job.part.words);
            }
          }
        }
        for (const job of jobs) {
          if (job.end < job.fullText.length) { progress.set(job.id, { offset: job.end, words: job.part.words }); done.delete(job.id); }
        }
      } catch (e) {
        for (const job of jobs) done.delete(job.id);
        if (!stopped) { failed = true; useWise.setState({ error: e instanceof Error ? e.message : '释义生成失败' }); }
      }
      finally { busy = false; if (!stopped) { useWise.setState({ loading: false }); timer = setTimeout(pump, 40); } }
    };
    const observer = new IntersectionObserver(changes => {
      for (const change of changes) {
        const id = (change.target as HTMLElement).dataset.block!;
        if (change.isIntersecting) { visible.add(id); positions.set(id, change.boundingClientRect.top + window.scrollY); }
        else { visible.delete(id); positions.delete(id); }
      }
      clearTimeout(timer); timer = setTimeout(pump, 120);
    }, { rootMargin: '800px' });
    root.querySelectorAll<HTMLElement>('[data-block]').forEach(el => { if (['p', 'li', 'quote', 'note'].includes(blocks.get(el.dataset.block!)?.type || '')) observer.observe(el); });
    return () => { stopped = true; rehintRef.current = null; window.removeEventListener('scroll', onScroll); clearTimeout(timer); controller.abort(); observer.disconnect(); clearWiseHints(); useWise.setState({ loading: false }); };
  }, [ix, root, on, ready, prefs.level, revision]);
  return null;
}
