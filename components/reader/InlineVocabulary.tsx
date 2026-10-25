"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLearning, updateWord } from "@/lib/learning-store";
import type { VocabularyEntry } from "@/lib/learning";
import type { Anchor } from "@/lib/store";
import { useStore } from "@/lib/store";
import { startGloss } from "@/lib/ask";
import { useReader } from "./context";
import { Pronunciation } from "./Pronunciation";

export function InlineVocabulary({ word, anchor, rect, onClose }: {
  word: VocabularyEntry; anchor: Anchor; rect: DOMRect; onClose: () => void;
}) {
  const { ix } = useReader();
  const display = useLearning(s => s.preferences.display);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const height = el.offsetHeight, width = el.offsetWidth;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(rect.bottom + 8 + height <= window.innerHeight - 12 ? rect.bottom + 8 : rect.top - height - 8, window.innerHeight - height - 12)),
      ready: true,
    });
  }, [rect, display, error]);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const scroll = (e: Event) => { if (!(e.target instanceof Node) || !panel.current?.contains(e.target)) onClose(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  function dictionary() {
    const existing = (useStore.getState().glosses[ix.article.id] ?? []).find(g => g.action === "define" && g.anchor?.start.b === anchor.start.b && g.anchor.start.o === anchor.start.o && g.anchor.end.b === anchor.end.b && g.anchor.end.o === anchor.end.o);
    if (existing) useStore.getState().setUI({ activeGloss: existing.id, activeHighlight: null, focusMode: false });
    else startGloss(ix, { anchor, action: "define" });
    onClose();
  }
  async function mastered() {
    setBusy(true);
    try { await updateWord(word.id, "mastered"); onClose(); }
    catch { setError("Could not save. Please retry. · 保存失败，请重试"); setBusy(false); }
  }
  return createPortal(<div ref={panel} role="dialog" aria-label={`Meaning of ${word.word}`} className="inline-vocabulary study-inline" style={{ left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}>
    <header className="study-row"><strong>{word.word}</strong><button ref={closeButton} aria-label="Close word explanation" onClick={onClose}><X size={14} /></button></header>
    <p className="study-muted">{word.partOfSpeech} {word.pronunciation}</p>
    {display !== "native" && <p lang="en">{word.english}</p>}
    {display !== "english" && <p>{word.native}</p>}
    <Pronunciation word={word.word} />
    <footer className="study-row"><button onClick={dictionary}>Dictionary ↗</button><button disabled={busy} onClick={mastered}>{busy ? "Saving…" : "I know this · 已掌握"}</button></footer>
    {error && <p role="alert">{error}</p>}
  </div>, document.body);
}
