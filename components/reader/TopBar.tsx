"use client";

import Link from "next/link";
import { VocabularyLink } from "@/components/ui/VocabularyLink";
import { WordWiseControl } from "./WordWise";
import { Contents } from "./Contents";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Keyboard, NotebookPen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Account } from "@/components/account/Account";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { ListenButton } from "./Listen";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { barBtn } from "@/components/ui/Popover";
import { useGlosses, useHighlights, useStore } from "@/lib/store";
import { useReader } from "./context";
import { readingScrollBehavior } from "@/lib/reading-motion";
import { useI18n } from "@/lib/ui-lang";
import { LanguageMenu } from "@/components/ui/LanguageMenu";

export function TopBar({ currentN, pastTitle, listenFrom }: { currentN: number | null; pastTitle: boolean; listenFrom: () => string | null }) {
  const { ix, jumpTo } = useReader();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [peek, setPeek] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const focusMode = useStore((s) => s.focusMode);
  const barRef = useRef<HTMLSpanElement>(null);
  const showRail = useStore(s => s.settings.rail);
  const setSettings = useStore(s => s.setSettings);
  const notebookOpen = useStore((s) => s.notebookOpen);
  const setUI = useStore((s) => s.setUI);
  const brief = useStore((s) => s.briefs[ix.article.id]);
  const count = useGlosses(ix.article.id).length + useHighlights(ix.article.id).length;

  // Tuck away while reading down, come back the moment the reader scrolls up.
  // The progress hairline is written straight to the DOM: no re-render per frame.
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      setScrolled(y > 8);
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 240);
      setScrolledUp(y < last);
      last = y;
    };
    const on = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  // In focus mode the bar stays away until the pointer touches the top edge,
  // and leaves again once it moves down past the bar. Touch: scroll up.
  useEffect(() => {
    if (!focusMode) return;
    setPeek(false);
    setScrolledUp(false);
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setPeek((p) => e.clientY < (p ? 96 : 12));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [focusMode]);

  // The key menu lives in this bar: when an answer asks for a key, come back into view.
  useEffect(() => {
    const show = () => {
      setHidden(false);
      setPeek(true);
    };
    window.addEventListener("gloss:key", show);
    return () => window.removeEventListener("gloss:key", show);
  }, []);

  const tucked = (focusMode ? !peek && !scrolledUp && !notebookOpen : hidden && !notebookOpen);

  const section = (() => {
    if (brief?.status !== "ready" || currentN === null) return null;
    let s: { title: string; start: number } | null = null;
    for (const x of brief.data.sections) if (x.start <= currentN) s = x;
    return s;
  })();

  return (
    <header
      className={`reader-topbar fixed inset-x-0 top-0 z-40 h-[var(--topbar-h)] transition-[transform,background-color,border-color] duration-300 ease-[var(--ease-out)] ${
        tucked ? "-translate-y-full" : ""
      } ${scrolled ? "border-b border-rule bg-bg/85 backdrop-blur-md" : "border-b border-transparent"}`}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link href="/library" className={`${barBtn} reader-back shrink-0`} aria-label={t("topbar.backAria")} data-tip={t("topbar.backAria")}><ArrowLeft size={18} strokeWidth={1.8} aria-hidden /><span className="hidden sm:inline">{t("topbar.library")}</span></Link>

        {/* Always a spacer; the running title shows in it from tablet width up. */}
        <div className={`flex min-w-0 flex-1 justify-center transition-opacity duration-300 ${pastTitle ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="hidden h-9 min-w-0 max-w-[560px] items-center gap-2 text-[13.5px] md:flex">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: readingScrollBehavior() })}
              className="min-w-0 truncate rounded-full px-2.5 py-1.5 font-serif text-[16px] leading-none text-ink transition-colors hover:bg-sunk"
              data-tip={t("topbar.backToTop")}
            >
              {ix.article.title}
            </button>
            {section && (
              <>
                <span className="h-3.5 w-px shrink-0 bg-rule-strong" aria-hidden />
                <button
                  type="button"
                  onClick={() => jumpTo(section.start, { flash: false })}
                  data-tip={t("topbar.goToPart")}
                  className="min-w-0 truncate rounded-full px-2 py-1.5 leading-none text-ink-3 hover:bg-sunk hover:text-ink"
                >
                  {section.title}
                </button>
              </>
            )}
          </div>
        </div>

        <nav aria-label="Reader tools" className="reader-tools flex items-center gap-1">
          <button type="button" className={`${barBtn} !hidden min-[1260px]:!inline-flex`}
            aria-label={showRail ? t("topbar.hideSidebar") : t("topbar.showSidebar")} aria-pressed={showRail}
            data-tip={showRail ? t("topbar.hideSidebar") : t("topbar.showSidebar")} onClick={() => setSettings({ rail: !showRail })}>
            {showRail ? <PanelLeftClose size={18} strokeWidth={1.8} /> : <PanelLeftOpen size={18} strokeWidth={1.8} />}<span className="toolbar-label">{t("topbar.sidebar")}</span>
          </button>
          <Contents /><WordWiseControl />
          <span className="hidden sm:block">
            <button type="button" className={barBtn} onClick={() => setUI({ shortcutsOpen: true })} aria-label={t("topbar.shortcuts")} data-tip={t("topbar.shortcuts")} data-tip-kbd="?">
              <Keyboard size={18} strokeWidth={1.8} /><span className="toolbar-label">{t("topbar.shortcuts")}</span>
            </button>
          </span>
          <ListenButton from={listenFrom} />
          <VocabularyLink className={barBtn} data-tip={t("topbar.vocabulary")} aria-label={t("topbar.vocabulary")}><BookOpenText size={18} strokeWidth={1.8} aria-hidden /><span className="toolbar-label">{t("topbar.vocabulary")}</span></VocabularyLink>
          <SettingsMenu />
          <LanguageMenu />
          <KeyMenu />
          <button
            type="button"
            className={`${barBtn} ${notebookOpen ? "bg-sunk text-ink" : ""}`}
            onClick={() => setUI({ notebookOpen: !notebookOpen })}
            aria-pressed={notebookOpen}
            aria-label={t("topbar.notebook")}
            data-tip={notebookOpen ? t("topbar.notebookOpen") : t("topbar.notebookClosed")}
            data-tip-kbd="N"
          >
            <NotebookPen size={18} strokeWidth={1.8} />
            <span className="toolbar-label">{t("topbar.notebook")}</span>
            {count > 0 && (
              <span className="toolbar-count min-w-[18px] rounded-full bg-[var(--rubric)] px-1.5 text-center text-[11px] font-semibold leading-[18px] tabular-nums text-white">{count}</span>
            )}
          </button>
          <Account />
        </nav>
      </div>
      <span ref={barRef} aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] origin-left bg-[var(--rubric)] opacity-80" style={{ transform: "scaleX(0)" }} />
    </header>
  );
}
