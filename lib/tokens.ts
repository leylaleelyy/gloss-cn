/**
 * Rough token counting for budget decisions. English is about four characters
 * per token; CJK and full-width punctuation are about one token per character.
 * The estimate errs on the safe side (over-counts slightly) so a document
 * never overflows the model's context window.
 */

const WIDE = /[\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

export function estimateTokens(text: string): number {
  let wide = 0;
  let narrow = 0;
  for (const ch of text) {
    if (WIDE.test(ch)) wide++;
    else narrow++;
  }
  return wide + Math.ceil(narrow / 4);
}
