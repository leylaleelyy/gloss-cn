"use client";

import { Suspense, useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpenText, ChevronDown, LoaderCircle, Search, Trash2 } from "lucide-react";
import { vocabularyReturn } from "@/lib/vocabulary-navigation";
import { Pronunciation } from "@/components/reader/Pronunciation";
import { TopBar } from "@/components/ui/TopBar";
import { LearningPreferences } from "@/components/reader/LearningPreferences";
import { hydrateLearning, removeWord, updateWord, useLearning } from "@/lib/learning-store";
import { useStore } from "@/lib/store";
import { applySettings } from "@/lib/settings";
import type { VocabularyEntry } from "@/lib/learning";
import { useI18n } from "@/lib/ui-lang";

type Status = VocabularyEntry["status"];
const STATUSES: Status[] = ["new", "familiar", "mastered"];

export default function VocabularyPage() {
  const { t } = useI18n();
  const { entries, ready, preferences, error } = useLearning();
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.toLocaleLowerCase());
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [limit, setLimit] = useState(60);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    useStore.getState().hydrate();
    applySettings(useStore.getState().settings);
    void hydrateLearning();
  }, []);

  const filtered = entries.filter(
    (entry) =>
      (filter === "all" || entry.status === filter) &&
      `${entry.word} ${entry.english} ${entry.native} ${entry.sources.map((s) => s.title).join(" ")}`.toLocaleLowerCase().includes(search)
  );
  const counts = {
    all: entries.length,
    new: entries.filter((e) => e.status === "new").length,
    familiar: entries.filter((e) => e.status === "familiar").length,
    mastered: entries.filter((e) => e.status === "mastered").length,
  };

  async function change(id: string, status?: Status) {
    try {
      if (status) await updateWord(id, status);
      else await removeWord(id);
      setFailure("");
    } catch {
      setFailure(t("vocab.saveFailed"));
    }
  }

  return (
    <>
      <TopBar here="vocabulary" />
      <main className="vocab-page">
        <Suspense fallback={null}>
          <VocabularyBack />
        </Suspense>

        <header className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] font-[380] leading-[1.05] tracking-[-0.02em] text-ink">{t("vocab.title")}</h1>
            <p className="mt-2 max-w-[46rem] text-[14px] leading-relaxed text-ink-3">{t("vocab.subtitle")}</p>
          </div>
          <span className="rounded-full border border-rule bg-raised px-3 py-1.5 text-[12.5px] tabular-nums text-ink-3">
            {t("vocab.count", { count: entries.length })}
          </span>
        </header>

        <details className="group mt-6 rounded-[14px] border border-rule bg-raised/60 px-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            {t("vocab.preferences")}
            <ChevronDown size={15} className="ml-auto text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-rule pb-3 pt-3">
            <LearningPreferences />
          </div>
        </details>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(60);
              }}
              aria-label={t("vocab.search")}
              placeholder={t("vocab.searchPlaceholder")}
              className="h-11 w-full rounded-full border border-rule bg-bg pl-10 pr-4 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rubric)]"
            />
          </label>
          <div role="tablist" aria-label={t("vocab.filter")} className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 py-0.5 sm:mx-0 sm:shrink-0 sm:px-0">
            {(["all", ...STATUSES] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => {
                  setFilter(key);
                  setLimit(60);
                }}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                  filter === key ? "bg-ink text-bg" : "border border-rule bg-bg text-ink-2 hover:border-rule-strong hover:text-ink"
                }`}
              >
                {t(`vocab.status.${key}`)}
                <span className={`tabular-nums ${filter === key ? "text-bg/65" : "text-ink-4"}`}>{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>

        {(failure || error) && <p role="alert" className="mt-4 rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-[13px] text-rubric-text">{failure || error}</p>}

        {!ready ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-[13.5px] text-ink-3" role="status">
            <LoaderCircle size={15} className="animate-spin" aria-hidden /> {t("vocab.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center px-6 text-center">
            <span className="grid size-14 place-items-center rounded-[18px] bg-sunk text-ink-3" aria-hidden>
              <BookOpenText size={24} strokeWidth={1.6} />
            </span>
            <p className="mt-4 font-serif text-[24px] leading-tight text-ink">{entries.length ? t("vocab.noMatchTitle") : t("vocab.emptyTitle")}</p>
            <p className="mt-2 max-w-[380px] text-[13.5px] leading-relaxed text-ink-3">{entries.length ? t("vocab.noMatchBody") : t("vocab.emptyBody")}</p>
            {!entries.length && (
              <Link href="/library" className="mt-5 inline-flex h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-bg transition-transform active:scale-[0.97]">
                {t("vocab.browse")}
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul className="mt-6 grid gap-3 lg:grid-cols-2">
              {filtered.slice(0, limit).map((entry) => (
                <li key={entry.id}>
                  <WordCard entry={entry} onStatus={(status) => void change(entry.id, status)} onRemove={() => void change(entry.id)} />
                </li>
              ))}
            </ul>
            {filtered.length > limit && (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={() => setLimit((n) => n + 60)} className="inline-flex h-10 items-center rounded-full border border-rule bg-bg px-4 text-[13px] font-medium text-ink-2 transition-colors hover:border-rule-strong hover:text-ink">
                  {t("vocab.showMore", { count: filtered.length - limit })}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function WordCard({ entry, onStatus, onRemove }: { entry: VocabularyEntry; onStatus: (status: Status) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const display = useLearning((s) => s.preferences.display);
  const [more, setMore] = useState(false);
  const sources = more ? entry.sources : entry.sources.slice(0, 1);
  return (
    <article className="group flex h-full flex-col rounded-[16px] border border-rule bg-bg px-4 py-4 transition-colors hover:border-rule-strong sm:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-[22px] leading-tight text-ink">{entry.word}</h2>
          <p className="mt-1 text-[12.5px] leading-none text-ink-3">
            {entry.partOfSpeech}
            {entry.pronunciation ? <span className="text-ink-4"> · {entry.pronunciation}</span> : null}
          </p>
        </div>
        <Pronunciation word={entry.word} />
        <button
          type="button"
          aria-label={t("vocab.removeAria", { word: entry.word })}
          data-tip={t("vocab.remove")}
          onClick={onRemove}
          className="grid size-8 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-sunk hover:text-ink"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-1.5 text-[14px] leading-[1.55]">
        {display !== "native" && entry.english && <p lang="en" className="text-ink">{entry.english}</p>}
        {display !== "english" && entry.native && <p className="text-ink-2">{entry.native}</p>}
      </div>

      {entry.sources.length > 0 && (
        <div className="mt-3 space-y-2">
          {sources.map((source, index) => (
            <blockquote key={`${source.articleId}:${index}`} className="rounded-[10px] border-l-2 border-[var(--rubric-line)] bg-sunk/45 px-3 py-2 text-[13px] leading-[1.55] text-ink-2">
              <p className="line-clamp-3">{source.sentence}</p>
              <Link href={`/read/${encodeURIComponent(source.articleId)}?block=${encodeURIComponent(source.blockId)}`} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 transition-colors hover:text-ink">
                {source.title} <span aria-hidden>↗</span>
              </Link>
            </blockquote>
          ))}
          {entry.sources.length > 1 && (
            <button type="button" onClick={() => setMore((v) => !v)} className="text-[12px] font-medium text-ink-3 transition-colors hover:text-ink">
              {more ? t("vocab.fewerSources") : t("vocab.moreSources", { count: entry.sources.length - 1 })}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <div role="group" aria-label={t("vocab.mastery", { word: entry.word })} className="flex flex-1 gap-1">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={entry.status === status}
              onClick={() => onStatus(status)}
              className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11.5px] font-medium transition-colors ${
                entry.status === status ? (status === "mastered" ? "bg-good/15 text-good" : status === "familiar" ? "bg-[var(--rubric-wash)] text-rubric-text" : "bg-sunk text-ink") : "text-ink-4 hover:bg-sunk hover:text-ink-2"
              }`}
            >
              {t(`vocab.status.${status}`)}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function VocabularyBack() {
  const params = useSearchParams();
  const { t } = useI18n();
  const returnTo = vocabularyReturn(params.get("from"), "https://gloss.invalid");
  return (
    <Link href={returnTo} aria-label={t("vocab.backAria")} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink">
      <ArrowLeft size={16} aria-hidden /> {t("vocab.back")}
    </Link>
  );
}
