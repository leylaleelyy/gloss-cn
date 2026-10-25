"use client";
import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { Pronunciation } from "@/components/reader/Pronunciation";
import { TopBar } from "@/components/ui/TopBar";
import { LearningPreferences } from "@/components/reader/LearningPreferences";
import { hydrateLearning, removeWord, updateWord, useLearning } from "@/lib/learning-store";
import { useStore } from "@/lib/store";
import { applySettings } from "@/lib/settings";
import type { VocabularyEntry } from "@/lib/learning";
export default function VocabularyPage() {
  const { entries, ready, preferences, error } = useLearning();
  const [query, setQuery] = useState(""), search = useDeferredValue(query.toLocaleLowerCase());
  const [filter, setFilter] = useState("all"), [limit, setLimit] = useState(60), [failure, setFailure] = useState("");
  useEffect(() => { useStore.getState().hydrate(); applySettings(useStore.getState().settings); void hydrateLearning(); }, []);
  const filtered = entries.filter(e => (filter === "all" || e.status === filter) && `${e.word} ${e.english} ${e.native} ${e.sources.map(s => s.title).join(" ")}`.toLocaleLowerCase().includes(search));
  async function change(id: string, status?: VocabularyEntry["status"]) { try { if (status) await updateWord(id, status); else await removeWord(id); setFailure(""); } catch { setFailure("Could not save changes · 无法保存更改，请重试"); } }
  return <><TopBar here="vocabulary" /><main className="vocabulary-page"><div className="study-row"><h1>Vocabulary · 生词本</h1><span>{entries.length} words · 词</span></div><p className="study-muted">Words in context, wherever you read. · 在语境中积累词汇。</p><details><summary>Learning preferences · 学习偏好</summary><LearningPreferences /></details><div className="study-row"><input aria-label="Search vocabulary" placeholder="Search words or books · 搜索词汇或书籍" value={query} onChange={e => { setQuery(e.target.value); setLimit(60); }} /><select aria-label="Mastery filter" value={filter} onChange={e => { setFilter(e.target.value); setLimit(60); }}><option value="all">All · 全部</option><option value="new">New · 生词</option><option value="familiar">Familiar · 熟悉</option><option value="mastered">Mastered · 已掌握</option></select></div>{(failure || error) && <p role="alert">{failure || error}</p>}{!ready ? <p>Loading… · 正在加载…</p> : !filtered.length ? <p>{entries.length ? "No matching words · 没有匹配的词汇" : "Select a word while reading, choose Define, then Save word. · 阅读时选中词汇，点击 Define，再保存生词。"}</p> : filtered.slice(0, limit).map(e => <article className="study-word" key={e.id}><div className="study-row"><h2>{e.word}</h2><span>{e.partOfSpeech} {e.pronunciation}</span><select aria-label={`Mastery of ${e.word}`} value={e.status} onChange={event => void change(e.id, event.target.value as VocabularyEntry["status"])}><option value="new">New · 生词</option><option value="familiar">Familiar · 熟悉</option><option value="mastered">Mastered · 已掌握</option></select></div>{preferences.display !== "native" && <p lang="en">{e.english}</p>}{preferences.display !== "english" && <p>{e.native}</p>}<Pronunciation word={e.word} />{e.sources.map((s, i) => <div key={i}><blockquote>{s.sentence}</blockquote><Link href={`/read/${encodeURIComponent(s.articleId)}?block=${encodeURIComponent(s.blockId)}`}>{s.title} ↗</Link></div>)}<button className="study-muted" onClick={() => void change(e.id)}>Remove · 移除</button></article>)}{filtered.length > limit && <button onClick={() => setLimit(n => n + 60)}>Show more · 加载更多 ({filtered.length - limit})</button>}</main></>;
}
