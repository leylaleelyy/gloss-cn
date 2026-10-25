"use client";
import { useState } from "react";
import { saveWord, useLearning } from "@/lib/learning-store";
import type { Analysis, Definition, WordSource } from "@/lib/learning";
import { Pronunciation } from "./Pronunciation";

export function WordCard({ word, source, surface }: { word: Definition; source: WordSource; surface?: string }) {
  const display = useLearning(s => s.preferences.display);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await saveWord(word, source, surface); setMessage("Saved · 已保存"); }
    catch { setMessage("Could not save. Please retry. · 保存失败，请重试"); }
    finally { setBusy(false); }
  }
  return <section className="study-word">
    <div className="study-row"><strong>{word.word}</strong><span>{word.partOfSpeech}</span></div>
    <p className="study-muted">{word.pronunciation}</p>
    {display !== "native" && <p lang="en">{word.english}</p>}
    {display !== "english" && <p>{word.native}</p>}
    <div className="study-row"><Pronunciation word={word.word} /><button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save word · 保存生词"}</button></div>
    <p role="status" className="study-muted">{message}</p>
  </section>;
}

export function AnalysisContent({ analysis: a, source }: { analysis: Analysis; source: WordSource }) {
  const [tab, setTab] = useState("simple");
  return <div className="study-inline">
    <div className="study-tabs" role="group" aria-label="Analysis sections">
      {[["simple", "Simplified"], ["words", "Vocabulary"], ["structure", "Structure"], ["translation", "Translation"]].map(([id, label]) =>
        <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <section className="study-content scroll-thin" aria-label={`${tab} analysis`} tabIndex={0}>
      {tab === "simple" && <p lang="en">{a.simplified}</p>}
      {tab === "translation" && <p>{a.translation}</p>}
      {tab === "words" && (a.vocabulary.length ? a.vocabulary.map((word, i) => <WordCard key={i} word={word} source={source} />) : <p>No vocabulary suggested · 暂无推荐词汇</p>)}
      {tab === "structure" && <>
        <p>{a.chunks.join(" / ")}</p><h3>Sentence backbone · 主干</h3><p>{a.backbone}</p>
        {a.grammar.map((g, i) => <section className="study-word" key={i}><strong>{g.part}</strong><p>{g.explanation}</p></section>)}
      </>}
    </section>
  </div>;
}
