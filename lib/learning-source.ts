import type { DocIndex } from "./doc";
import type { Anchor } from "./store";
import type { WordSource } from "./learning";

export function learningSource(ix: DocIndex, anchor: Anchor): WordSource {
  const text = ix.texts.get(anchor.start.b) ?? anchor.quote;
  let sentence = text;
  if (typeof Intl.Segmenter !== "undefined") {
    const segment = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)].find(s => s.index <= anchor.start.o && s.index + s.segment.length > anchor.start.o);
    sentence = segment?.segment ?? text;
  }
  return { articleId: ix.article.id, title: ix.article.title, blockId: anchor.start.b, sentence: sentence.slice(0, 12000), quote: anchor.quote, offset: anchor.start.o };
}
