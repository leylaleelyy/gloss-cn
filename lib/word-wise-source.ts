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
