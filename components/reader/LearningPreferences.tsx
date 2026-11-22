"use client";
import { useEffect } from "react";
import { LEVELS, type LearningPreferences as Preferences } from "@/lib/learning";
import { hydrateLearning, setLearning, useLearning } from "@/lib/learning-store";
import { useI18n } from "@/lib/ui-lang";
export function LearningPreferences() {
  const p = useLearning(s => s.preferences), error = useLearning(s => s.error);
  const { t } = useI18n();
  useEffect(() => { void hydrateLearning(); }, []);
  return <fieldset className="study-preferences"><legend>{t("learning.title")}</legend><label>{t("learning.level")}<select value={p.level} onChange={e => setLearning({ level: e.target.value as Preferences["level"] })}>{LEVELS.map(x => <option key={x}>{x}</option>)}</select></label><label>{t("learning.definitions")}<select value={p.display} onChange={e => setLearning({ display: e.target.value as Preferences["display"] })}><option value="bilingual">{t("learning.bilingual")}</option><option value="english">{t("learning.english")}</option><option value="native">{t("learning.native")}</option></select></label><label><input type="checkbox" checked={p.highlight} onChange={e => setLearning({ highlight: e.target.checked })} /> {t("learning.highlightWords")}</label>{error && <p role="alert">{error}</p>}</fieldset>;
}
