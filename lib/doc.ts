import { blockText, modelText, numberBlocks, wordCount, type Article } from "./article";
import type { DocPayload } from "./prompts";
import { estimateTokens } from "./tokens";

/** Everything the reader derives once from an article. */
export type DocIndex = {
  article: Article;
  texts: Map<string, string>;
  order: Map<string, number>;
  numbers: Map<string, number>;
  byNumber: Map<number, string>;
  words: number;
};

export function indexArticle(article: Article): DocIndex {
  const texts = new Map<string, string>();
  const order = new Map<string, number>();
  article.blocks.forEach((b, i) => {
    texts.set(b.id, blockText(b));
    order.set(b.id, i);
  });
  const numbers = numberBlocks(article.blocks);
  const byNumber = new Map<number, string>();
  numbers.forEach((n, id) => byNumber.set(n, id));
  return { article, texts, order, numbers, byNumber, words: wordCount(article) };
}

/**
 * About 100k tokens of text for the system message. Counted in estimated
 * tokens rather than characters, so CJK text (about one token a character)
 * is windowed at the same model cost as English (about four characters a
 * token). Past this, send a window around where the reader is.
 */
const BUDGET_TOKENS = 100_000;

export function docPayload(ix: DocIndex, focusBlock?: string): DocPayload {
  const paras = ix.article.blocks
    .filter((b) => ix.numbers.has(b.id))
    .map((b) => ({ n: ix.numbers.get(b.id)!, text: b.type === "table" ? modelText(b) : ix.texts.get(b.id) ?? "" }));
  const base = { title: ix.article.title, author: ix.article.author, published: ix.article.published };
  const total = paras.reduce((a, p) => a + estimateTokens(p.text), 0);
  if (total <= BUDGET_TOKENS) return { ...base, paras };

  // Grow a window outward from the focus paragraph until the budget is spent.
  const center = Math.max(0, paras.findIndex((p) => p.n === (focusBlock ? ix.numbers.get(focusBlock) : 1)));
  let lo = center;
  let hi = center;
  let used = estimateTokens(paras[center]?.text ?? "");
  while (lo > 0 || hi < paras.length - 1) {
    const grew = used;
    if (hi < paras.length - 1 && used + estimateTokens(paras[hi + 1].text) <= BUDGET_TOKENS) used += estimateTokens(paras[++hi].text);
    if (lo > 0 && used + estimateTokens(paras[lo - 1].text) <= BUDGET_TOKENS) used += estimateTokens(paras[--lo].text);
    if (used === grew) break;
  }
  return { ...base, paras: paras.slice(lo, hi + 1), partial: true };
}
