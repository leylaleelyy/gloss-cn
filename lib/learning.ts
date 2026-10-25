export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = typeof LEVELS[number];
export type LearningPreferences = { level: Level; display: "bilingual" | "english" | "native"; highlight: boolean };
export const DEFAULT_LEARNING: LearningPreferences = { level: "B1", display: "bilingual", highlight: true };
export function learningPreferences(raw: unknown): LearningPreferences {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<LearningPreferences>;
  return { level: LEVELS.includes(value.level as Level) ? value.level! : "B1", display: ["bilingual", "english", "native"].includes(value.display ?? "") ? value.display! : "bilingual", highlight: typeof value.highlight === "boolean" ? value.highlight : true };
}
export type Definition = { word: string; partOfSpeech: string; pronunciation: string; english: string; native: string };
export type Analysis = { simplified: string; translation: string; chunks: string[]; backbone: string; grammar: { part: string; explanation: string }[]; vocabulary: Definition[] };
export type WordSource = { articleId: string; title: string; blockId: string; sentence: string; quote: string; offset: number };
export type VocabularyEntry = Definition & { id: string; surface: string; status: "new" | "familiar" | "mastered"; sources: WordSource[]; createdAt: number; updatedAt: number };
export const normalizeWord = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const clean = (value: unknown, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function definition(raw: unknown): Definition {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = { word: clean(v.word, 120), partOfSpeech: clean(v.partOfSpeech, 80), pronunciation: clean(v.pronunciation, 160), english: clean(v.english), native: clean(v.native) };
  if (!d.word || !d.english || !d.native) throw new Error("The provider returned an incomplete definition. Please retry.");
  return d;
}
export function analysis(raw: unknown): Analysis {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result: Analysis = {
    simplified: clean(v.simplified, 12000), translation: clean(v.translation, 12000), backbone: clean(v.backbone, 2000),
    chunks: Array.isArray(v.chunks) ? v.chunks.filter((x): x is string => typeof x === "string").slice(0, 60).map(x => x.slice(0, 2000)) : [],
    grammar: Array.isArray(v.grammar) ? v.grammar.slice(0, 16).map(x => ({ part: clean(x?.part, 1000), explanation: clean(x?.explanation, 2000) })).filter(x => x.part && x.explanation) : [],
    vocabulary: Array.isArray(v.vocabulary) ? v.vocabulary.slice(0, 12).flatMap(x => { try { return [definition(x)]; } catch { return []; } }) : [],
  };
  if (!result.simplified || !result.translation || !result.backbone || !result.chunks.length || !result.grammar.length) throw new Error("The provider returned incomplete sentence analysis. Please retry.");
  return result;
}

/** Token trie: no giant regex or per-word scans of the whole book. Offsets are UTF-16, like DOM Range. */
type Trie = { next: Map<string, Trie>; id?: string };
const tokens = (text: string) => [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’‘-][\p{L}\p{M}\p{N}]+)*/gu)].map(m => ({ word: normalizeWord(m[0]), from: m.index!, to: m.index! + m[0].length }));
export function vocabularyMatcher(entries: Pick<VocabularyEntry, "word" | "surface" | "status" | "id">[]) {
  const root: Trie = { next: new Map() };
  for (const entry of entries) {
    if (entry.status === "mastered") continue;
    for (const form of new Set([entry.word, entry.surface])) {
      const list = tokens(form);
      if (!list.length || list.length > 12) continue;
      let node = root;
      for (const t of list) { if (!node.next.has(t.word)) node.next.set(t.word, { next: new Map() }); node = node.next.get(t.word)!; }
      node.id ??= entry.id;
    }
  }
  return (text: string) => {
    const list = tokens(text), hits: { from: number; to: number; id: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      let node: Trie | undefined = root, end = -1, id = "";
      for (let j = i; j < Math.min(list.length, i + 12); j++) {
        if (j > i && !/^\s+$/.test(text.slice(list[j - 1].to, list[j].from))) break;
        node = node?.next.get(list[j].word); if (!node) break;
        if (node.id) { end = j; id = node.id; }
      }
      if (end >= i) { hits.push({ from: list[i].from, to: list[end].to, id }); i = end; }
    }
    return hits;
  };
}

export function definitionText(d: Definition): string {
  return [`**${d.word}** · ${d.partOfSpeech}`, d.pronunciation, d.english, d.native].filter(Boolean).join("\n\n");
}

/** Plain Markdown transcript for copying, notebook previews, and AI follow-ups. */
export function analysisText(a: Analysis): string {
  return [`## Simplified\n${a.simplified}`, `## Translation\n${a.translation}`, `## Structure\n${a.chunks.join(" / ")}\n\n${a.backbone}`, ...a.grammar.map(g => `**${g.part}**\n${g.explanation}`), `## Vocabulary\n${a.vocabulary.map(w => `**${w.word}** — ${w.english} / ${w.native}`).join("\n\n")}`].join("\n\n");
}
