import assert from "node:assert/strict";
import { vocabularyMatcher, learningPreferences, definition, definitionText, analysis, analysisText } from "../lib/learning.ts";
const entry = (word, surface = word, status = "new") => ({ id: word, word, surface, status });
const match = vocabularyMatcher([entry("run", "ran"), entry("in spite of"), entry("café"), entry("known", "known", "mastered"), entry("reader’s")]);
const text = "😀 Ran running RUN in spite of rain; in, spite of café known reader's.";
assert.deepEqual(match(text).map(h => text.slice(h.from, h.to)), ["Ran", "RUN", "in spite of", "café", "reader's"]);
assert.deepEqual(vocabularyMatcher([entry("river"), entry("river bank")])("river bank").map(x => x.id), ["river bank"]);
assert.deepEqual(learningPreferences({ level: "Z9", display: "broken" }), { level: "B1", display: "bilingual", highlight: true });
assert.throws(() => definition({ word: "bank" })); assert.throws(() => analysis({ simplified: "partial" }));
const many = vocabularyMatcher(Array.from({ length: 10000 }, (_, i) => entry(`word${i}`)));
const begin = performance.now(); assert.equal(many("word9999 word2 unknown running").length, 2);
console.log(`PASS: contextual schemas, preferences, Unicode offsets, inflected surfaces, phrases, mastered exclusion, 10,000-word lookup (${(performance.now()-begin).toFixed(1)}ms).`);

const structured = analysis({ simplified: "Think carefully.", translation: "仔细思考。", backbone: "Think — 祈使句", chunks: ["Think", "carefully."], grammar: [{ part: "carefully", explanation: "副词" }], vocabulary: [{ word: "think", english: "Use your mind.", native: "思考" }] });
const restored = JSON.parse(JSON.stringify({ action: "simplify", turns: [{ role: "assistant", content: analysisText(structured), analysis: structured }] }));
assert.equal(restored.turns[0].analysis.translation, "仔细思考。");
for (const phrase of ["Think carefully.", "仔细思考。", "副词", "Use your mind."]) assert.ok(restored.turns[0].content.includes(phrase));
console.log("PASS: persisted analysis retains structured fields and a complete bilingual notebook/copy transcript.");

const word = definition({ word: "ponder", partOfSpeech: "verb", pronunciation: "/ˈpɒndə/", english: "Think carefully.", native: "仔细思考。" });
const dictionary = JSON.parse(JSON.stringify({ action: "define", turns: [{ role: "assistant", definition: word, content: definitionText(word) }] }));
assert.deepEqual(dictionary.turns[0].definition, word);
for (const value of Object.values(word)) assert.ok(dictionary.turns[0].content.includes(value));
console.log("PASS: dictionary card persists pronunciation and bilingual meaning with a complete transcript.");
