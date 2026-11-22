"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, FileUp, LoaderCircle } from "lucide-react";
import { GlossWordmark } from "@/components/brand/Gloss";
import { importFromFile, keep } from "@/lib/import";
import { wordCount } from "@/lib/article";
import { flushDocMigrations, useGlosses, useHighlights, useStore } from "@/lib/store";
import { libraryKey } from "@/lib/dedupe";
import { actionLabel, useI18n } from "@/lib/ui-lang";
import { keyLine } from "./Answer";

/**
 * The text body belongs to the device that imported it. Another device still
 * has every synced card, note and highlight, and can read them here without
 * pulling a multi-megabyte document through the Worker.
 */
export function RemoteCards({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const item = useStore((s) => s.library.find((x) => x.id === id));
  const glosses = useGlosses(id);
  const highlights = useHighlights(id);
  const notes = highlights.filter((h) => h.note);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const result = await importFromFile(file);
      if (!result.ok) { setError(result.error); return; }
      const saveError = await keep(result.article, result.file);
      if (saveError) { setError(saveError); return; }
      const key = libraryKey({ ...result.article, origin: "file", words: wordCount(result.article) });
      await flushDocMigrations();
      const target = useStore.getState().library.find((entry) => libraryKey(entry) === key);
      window.location.href = `/read/${encodeURIComponent(target?.id ?? result.article.id)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("remote.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-[calc(var(--topbar-h)+40px)] sm:px-8">
      <Link href="/library" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> {t("remote.back")}
      </Link>

      <header className="mt-7">
        <div className="flex items-center gap-2 text-[12px] font-medium text-rubric-text">
          <span className="size-1.5 rounded-full bg-[var(--rubric)]" aria-hidden />
          {t("remote.kicker")}
        </div>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] font-[380] leading-[1.08] tracking-[-0.02em] text-ink">{item?.title ?? t("remote.titleFallback")}</h1>
        <p className="mt-3 max-w-[52rem] text-[14px] leading-relaxed text-ink-3">{t("remote.body")}</p>
      </header>

      <div className="mt-6 rounded-[16px] border border-rule bg-raised/60 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-bg transition-transform active:scale-[0.98] disabled:opacity-60">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <FileUp size={15} aria-hidden />}
            {busy ? t("remote.importing") : t("remote.upload")}
          </button>
          <span className="text-[12.5px] text-ink-3">{t("remote.uploadHint")}</span>
        </div>
        <input ref={input} type="file" className="sr-only" accept=".epub,.pdf,.txt,.md,.markdown,application/epub+zip,application/pdf,text/plain,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void open(file); }} />
        {error && <p role="alert" className="mt-3 text-[12.5px] leading-relaxed text-rubric-text">{error}</p>}
      </div>

      <section aria-label={t("remote.cards")} className="mt-7">
        <h2 className="text-[12.5px] font-medium text-ink-3">{t("remote.cards")} <span className="tabular-nums text-ink-4">{glosses.length + notes.length}</span></h2>
        {glosses.length === 0 && notes.length === 0 ? (
          <div className="mt-3 rounded-[16px] border border-rule bg-bg px-5 py-10 text-center">
            <div className="mx-auto w-fit text-ink-4"><GlossWordmark /></div>
            <p className="mt-4 font-serif text-[20px] text-ink">{t("remote.noCards")}</p>
            <p className="mt-2 text-[13px] text-ink-3">{t("remote.noCardsHint")}</p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {glosses.map((g) => {
              const answer = g.turns.filter((turn) => turn.role === "assistant" && turn.content).at(-1);
              const line = answer ? keyLine(answer.content) : "";
              return (
                <li key={g.id} className="rounded-[16px] border border-rule bg-bg px-4 py-4">
                  <div className="flex items-baseline gap-2 text-[11.5px]">
                    <span className="font-semibold text-rubric-text">{actionLabel(lang, g.action)}</span>
                    {answer?.model && <span className="truncate text-ink-4">{answer.model}</span>}
                  </div>
                  {g.anchor && <p className="mt-2 line-clamp-2 border-l-2 border-[var(--rubric-line)] pl-2.5 font-serif text-[14.5px] leading-snug text-ink-3">{g.anchor.quote}</p>}
                  {g.question && <p className="mt-2 text-[14px] font-medium leading-snug text-ink">{g.question}</p>}
                  {line && <p className="mt-1.5 line-clamp-4 text-[13px] leading-[1.5] text-ink-2">{line}</p>}
                </li>
              );
            })}
            {notes.map((h) => (
              <li key={h.id} className="rounded-[16px] border border-rule bg-bg px-4 py-4">
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <span className="font-semibold text-rubric-text">{t("remote.note")}</span>
                  {h.color && <span className="size-2 rounded-full" style={{ background: h.color }} aria-hidden />}
                </div>
                <p className="mt-2 line-clamp-2 border-l-2 border-[var(--rubric-line)] pl-2.5 font-serif text-[14.5px] leading-snug text-ink-3">{h.anchor.quote}</p>
                <p className="mt-2 whitespace-pre-line text-[13.5px] leading-[1.55] text-ink-2">{h.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
