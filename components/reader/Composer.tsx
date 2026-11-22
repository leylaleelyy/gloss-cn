"use client";

import { forwardRef, useLayoutEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ARTICLE_QUESTIONS } from "@/lib/actions";
import { startGloss } from "@/lib/ask";
import { useReader } from "./context";
import { useI18n } from "@/lib/ui-lang";
import { WebSwitch } from "./WebSwitch";

export type ComposerHandle = { focus: () => void };

/**
 * Ask about the whole text. The answer is written in the margin beside the
 * paragraph you were reading when you asked, so it stays where your head was.
 */
export const Composer = forwardRef<ComposerHandle, { currentBlock: () => string | null; suggestions?: string[] }>(function Composer(
  { currentBlock, suggestions = ARTICLE_QUESTIONS },
  ref
) {
  const { ix } = useReader();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  useLayoutEffect(() => {
    if (!focused) return;
    const viewport = window.visualViewport;
    const dock = dockRef.current;
    if (!viewport || !dock) return;
    // Safari pans and resizes the visual viewport without resizing the layout viewport.
    const fit = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      dock.style.bottom = `calc(${inset}px + max(12px, env(safe-area-inset-bottom)))`;
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      dock.style.removeProperty("bottom");
    };
  }, [focused]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    startGloss(ix, { at: currentBlock() ?? undefined, action: "ask", question: text });
    setQ("");
    inputRef.current?.blur();
  };

  return (
    <div ref={dockRef} className="composer focus-hide pointer-events-none sticky bottom-4 z-30 mt-20 sm:bottom-6">
      {focused && !q && (
        <div className="pointer-events-auto mb-2 flex flex-wrap justify-center gap-1.5" style={{ animation: "rise 0.3s var(--ease-out) both" }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => ask(s)}
              className="rounded-full border border-rule bg-raised/95 px-3 py-1.5 text-[12.5px] text-ink-2 shadow-card backdrop-blur transition-colors hover:border-rule-strong hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className={`pointer-events-auto mx-auto flex max-w-[34rem] items-center gap-2 rounded-[16px] border bg-raised/92 py-1.5 pl-4 pr-1.5 shadow-pop backdrop-blur-md transition-[border-color,max-width] duration-300 ease-[var(--ease-out)] ${
          focused ? "max-w-[38rem] border-rule-strong" : "border-rule"
        }`}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              inputRef.current?.blur();
            }
          }}
          placeholder={t("composer.placeholder")}
          aria-label={t("composer.aria")}
          className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none focus-visible:outline-none placeholder:text-ink-3"
        />
        {!focused && !q && <kbd className="hidden sm:inline">/</kbd>}
        <WebSwitch />
        <button
          type="submit"
          disabled={!q.trim()}
          aria-label={t("composer.send")}
          data-tip={t("composer.send")}
          data-tip-kbd={"\u21b5"}
          className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-ink text-bg transition-opacity disabled:opacity-25"
        >
          <ArrowUp size={17} strokeWidth={2.3} />
        </button>
      </form>
    </div>
  );
});
