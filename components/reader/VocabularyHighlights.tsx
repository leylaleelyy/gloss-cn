"use client";
import { useEffect, useState } from "react";
import { hydrateLearning, useLearning } from "@/lib/learning-store";
import { vocabularyMatcher } from "@/lib/learning";
import type { Anchor } from "@/lib/store";
import { InlineVocabulary } from "./InlineVocabulary";
export function VocabularyHighlights({ root }: { root: HTMLElement | null }) {
  const [opened, setOpened] = useState<{ id: string; anchor: Anchor; rect: DOMRect } | null>(null);
  const entries = useLearning(s => s.entries), enabled = useLearning(s => s.preferences.highlight);
  useEffect(() => { void hydrateLearning(); }, []);
  useEffect(() => {
    if (!root || !enabled || !entries.length || !("highlights" in CSS) || typeof Highlight === "undefined") return;
    const match = vocabularyMatcher(entries), highlight = new Highlight();
    CSS.highlights.set("gloss-vocabulary", highlight);
    const hovered = new Highlight();
    CSS.highlights.set("gloss-vocabulary-hover", hovered);
    let hoverFrame = 0;
    function leave() { cancelAnimationFrame(hoverFrame); hovered.clear(); root?.removeAttribute("data-vocabulary-hover"); }
    function move(event: PointerEvent) {
      cancelAnimationFrame(hoverFrame);
      const target = event.target instanceof Element ? event.target : null;
      const block = target?.closest("[data-block]");
      const x = event.clientX, y = event.clientY;
      hoverFrame = requestAnimationFrame(() => {
        hovered.clear();
        const hit = block && (ranges.get(block) ?? []).find(h => Array.from(h.range.getClientRects()).some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom));
        if (hit) { hovered.add(hit.range); root?.setAttribute("data-vocabulary-hover", "true"); }
        else root?.removeAttribute("data-vocabulary-hover");
      });
    }
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", leave);
    const active = new Set<Element>(), ranges = new Map<Element, { range: Range; id: string; from: number; to: number }[]>(), queue = new Set<Element>(); let frame = 0;
    function clear(el: Element) { for (const r of ranges.get(el) ?? []) highlight.delete(r.range); ranges.delete(el); }
    function scan(el: Element) {
      clear(el); const content = el.querySelector(".blk-text"); if (!content || el.getAttribute("data-type") === "pre") return;
      const hits = match(content.textContent ?? ""); if (!hits.length) return;
      const nodes: { node: Text; from: number; to: number }[] = []; const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT); let offset = 0;
      while (walker.nextNode()) { const node = walker.currentNode as Text; nodes.push({ node, from: offset, to: offset + node.length }); offset += node.length; }
      const added: { range: Range; id: string; from: number; to: number }[] = [];
      for (const hit of hits) { const start = nodes.find(n => n.to > hit.from), end = nodes.find(n => n.to >= hit.to); if (!start || !end) continue; const r = new Range(); r.setStart(start.node, hit.from - start.from); r.setEnd(end.node, hit.to - end.from); added.push({ range: r, ...hit }); highlight.add(r); }
      ranges.set(el, added);
    }
    function click(event: MouseEvent) {
      if (event.button !== 0 || event.detail > 1 || !window.getSelection()?.isCollapsed) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a, button, input, textarea")) return;
      const block = target?.closest("[data-block]");
      if (!block) return;
      for (const hit of ranges.get(block) ?? []) {
        const rect = Array.from(hit.range.getClientRects()).find(r => event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom);
        if (!rect) continue;
        event.preventDefault(); event.stopPropagation();
        const b = block.getAttribute("data-block")!;
        setOpened({ id: hit.id, rect, anchor: { start: { b, o: hit.from }, end: { b, o: hit.to }, quote: hit.range.toString() } });
        return;
      }
    }
    root.addEventListener("click", click, true);
    function flush() { frame = 0; const start = performance.now(); for (const el of queue) { queue.delete(el); if (active.has(el)) scan(el); if (performance.now() - start > 4) break; } if (queue.size) frame = requestAnimationFrame(flush); }
    function schedule(el: Element) { queue.add(el); if (!frame) frame = requestAnimationFrame(flush); }
    const observer = new IntersectionObserver(changes => { for (const change of changes) { if (change.isIntersecting) { active.add(change.target); schedule(change.target); } else { active.delete(change.target); queue.delete(change.target); clear(change.target); } } }, { rootMargin: "400px" });
    root.querySelectorAll("[data-block]").forEach(el => observer.observe(el));
    // Existing annotation spans can be replaced by React. Rebuild only their visible ranges.
    const mutations = new MutationObserver(changes => { for (const change of changes) { const element = change.target instanceof Element ? change.target : change.target.parentElement; const block = element?.closest("[data-block]"); if (block && active.has(block)) schedule(block); } });
    mutations.observe(root, { childList: true, characterData: true, subtree: true });
    return () => { leave(); root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", leave); CSS.highlights.delete("gloss-vocabulary-hover"); root.removeEventListener("click", click, true); observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); CSS.highlights.delete("gloss-vocabulary"); };
  }, [root, entries, enabled]);
  const word = enabled && opened ? entries.find(e => e.id === opened.id && e.status !== "mastered") : undefined;
  return word && opened ? <InlineVocabulary key={word.id + opened.anchor.start.b + opened.anchor.start.o} word={word} anchor={opened.anchor} rect={opened.rect} onClose={() => setOpened(null)} /> : null;
}
