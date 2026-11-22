import { readWiseCache, writeWiseCache } from './word-wise-cache';
import { parseWiseWords } from './word-wise-data';
import { providerHeaders } from './provider-config';

/** A provider failure pauses new requests, never access to already cached paragraphs. */
export async function loadWiseWords(key: string, text: string, level: string, signal: AbortSignal, allowNetwork: boolean, onFetch: () => void) {
  const cached = await readWiseCache(key);
  signal.throwIfAborted();
  if (cached !== undefined) return cached;
  if (!allowNetwork) return undefined;
  onFetch();
  const response = await fetch('/api/word-wise', {
    method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    headers: { 'Content-Type': 'application/json', ...providerHeaders() }, body: JSON.stringify({ text, level }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || '释义生成失败');
  const words = parseWiseWords(data?.words);
  if (!words) throw new Error('释义返回格式不正确，请重试。');
  signal.throwIfAborted();
  await writeWiseCache(key, words);
  return words;
}

/** Several visible paragraphs in one provider call; cached paragraphs are served locally. */
export async function loadWiseWordsBatch(
  items: { key: string; text: string }[],
  level: string,
  signal: AbortSignal,
  allowNetwork: boolean,
  onFetch: () => void
): Promise<Map<string, import('./word-wise').WiseWord[]>> {
  const out = new Map<string, import('./word-wise').WiseWord[]>();
  const missing: { key: string; text: string }[] = [];
  for (const item of items) {
    const cached = await readWiseCache(item.key);
    signal.throwIfAborted();
    if (cached !== undefined) out.set(item.key, cached);
    else missing.push(item);
  }
  if (!missing.length || !allowNetwork) return out;
  if (missing.length === 1) {
    const item = missing[0];
    const words = await loadWiseWords(item.key, item.text, level, signal, true, onFetch);
    if (words !== undefined) out.set(item.key, words);
    return out;
  }

  onFetch();
  const response = await fetch('/api/word-wise', {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    headers: { 'Content-Type': 'application/json', ...providerHeaders() },
    body: JSON.stringify({ texts: missing.map((item) => item.text), level }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || '释义生成失败');
  const passages = Array.isArray(data?.passages) ? data.passages : null;
  // A model may answer a multi-passage request malformed; retry those passages one at a time
  // rather than losing Word Wise for the whole viewport.
  if (!passages || passages.length !== missing.length) {
    for (const item of missing) {
      const words = await loadWiseWords(item.key, item.text, level, signal, true, onFetch);
      if (words !== undefined) out.set(item.key, words);
    }
    return out;
  }
  for (let i = 0; i < missing.length; i++) {
    const words = parseWiseWords(passages[i]);
    if (!words) {
      const single = await loadWiseWords(missing[i].key, missing[i].text, level, signal, true, onFetch);
      if (single !== undefined) out.set(missing[i].key, single);
      continue;
    }
    signal.throwIfAborted();
    await writeWiseCache(missing[i].key, words);
    out.set(missing[i].key, words);
  }
  return out;
}
