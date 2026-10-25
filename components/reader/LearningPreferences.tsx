"use client";
import { useEffect } from "react";
import { LEVELS, type LearningPreferences as Preferences } from "@/lib/learning";
import { hydrateLearning, setLearning, useLearning } from "@/lib/learning-store";
export function LearningPreferences() {
  const p = useLearning(s => s.preferences), error = useLearning(s => s.error);
  useEffect(() => { void hydrateLearning(); }, []);
  return <fieldset className="study-preferences"><legend>Learning · 学习偏好</legend><label>English level · 英语水平<select value={p.level} onChange={e => setLearning({ level: e.target.value as Preferences["level"] })}>{LEVELS.map(x => <option key={x}>{x}</option>)}</select></label><label>Definitions · 释义显示<select value={p.display} onChange={e => setLearning({ display: e.target.value as Preferences["display"] })}><option value="bilingual">Bilingual · 双语</option><option value="english">English · 英文</option><option value="native">Response language · 回答语言</option></select></label><label><input type="checkbox" checked={p.highlight} onChange={e => setLearning({ highlight: e.target.checked })} /> Highlight saved words · 标记生词</label>{error && <p role="alert">{error}</p>}</fieldset>;
}
