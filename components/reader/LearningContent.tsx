"use client";
import { useState } from "react";
import { saveWord, useLearning } from "@/lib/learning-store";
import type { Analysis, Definition, WordSource } from "@/lib/learning";
import { Pronunciation } from "./Pronunciation";
import { useI18n } from "@/lib/ui-lang";

export function WordCard({ word, source, surface }: { word: Definition; source: WordSource; surface?: string }) {
  const { t } = useI18n();
  const display = useLearning(s => s.preferences.display);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await saveWord(word, source, surface); setMessage(t("learning.saved")); }
    catch { setMessage(t("learning.saveFailed")); }
    finally { setBusy(false); }
  }
  return <section className="study-word">
    <div className="study-row"><strong>{word.word}</strong><span>{word.partOfSpeech}</span></div>
    <p className="study-muted">{word.pronunciation}</p>
    {display !== "native" && <p lang="en">{word.english}</p>}
    {display !== "english" && <p>{word.native}</p>}
    <div className="study-row"><Pronunciation word={word.word} /><button disabled={busy} onClick={save}>{busy ? t("learning.saving") : t("learning.saveWord")}</button></div>
    <p role="status" className="study-muted">{message}</p>
  </section>;
}

export function AnalysisContent({ analysis: a, source }: { analysis: Analysis; source: WordSource }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("simple");
  return <div className="study-inline">
    <div className="study-tabs" role="group" aria-label={t("learning.sections")}>
      {[["simple", t("learning.simplified")], ["words", t("learning.vocabulary")], ["structure", t("learning.structure")], ["translation", t("learning.translation")]].map(([id, label]) =>
        <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <section className="study-content scroll-thin" aria-label={t("learning.analysis", { tab })} tabIndex={0}>
      {tab === "simple" && <p lang="en">{a.simplified}</p>}
      {tab === "translation" && <p>{a.translation}</p>}
      {tab === "words" && (a.vocabulary.length ? a.vocabulary.map((word, i) => <WordCard key={i} word={word} source={source} />) : <p>{t("learning.noVocab")}</p>)}
      {tab === "structure" && <>
        <p>{a.chunks.join(" / ")}</p><h3>{t("learning.backbone")}</h3><p>{a.backbone}</p>
        {a.grammar.map((g, i) => <section className="study-word" key={i}><strong>{g.part}</strong><p>{g.explanation}</p></section>)}
      </>}
    </section>
  </div>;
}
