"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { List } from "lucide-react";
import { Popover, barBtn } from "@/components/ui/Popover";
import { useReader } from "./context";

export function Contents({ align = "right" }: { align?: "left" | "right" }) {
  const { ix, jumpToBlock } = useReader();
  const entries = useMemo(() => ix.article.toc?.length ? ix.article.toc : ix.article.blocks
    .filter(b => b.type === "h2" || b.type === "h3")
    .map(b => ({ id: b.id, title: b.runs.map(r => r.text).join(""), level: b.type === "h3" ? 2 : 1 })), [ix]);
  if (!entries.length) return null;
  return <Popover align={align} label="Contents · 目录" triggerClass={barBtn} trigger={<><List size={18} strokeWidth={1.8} aria-hidden /><span className="toolbar-label">Contents</span></>} width={320}>
    {close => <ContentsList entries={entries} onJump={id => { jumpToBlock(id, { flash: false }); close(); }} />}
  </Popover>;
}

function ContentsList({ entries, onJump }: { entries: { id: string; title: string; level: number }[]; onJump: (id: string) => void }) {
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(60);
  const deferred = useDeferredValue(query.trim().toLocaleLowerCase());
  const searchable = useMemo(() => entries.map(e => ({ ...e, search: e.title.toLocaleLowerCase() })), [entries]);
  const matches = useMemo(() => searchable.filter(e => e.search.includes(deferred)), [searchable, deferred]);
  return <nav aria-label="Book contents">
      <p className="mb-3 text-sm font-medium">Contents · 目录</p>
      <input type="search" aria-label="搜索章节" placeholder="搜索章节…" value={query} onChange={e => { setQuery(e.target.value); setLimit(60); }} className="mb-3 min-h-11 w-full rounded-lg border border-rule bg-bg px-3 text-sm outline-none focus:border-ink-3" />
      <div aria-busy={query.trim().toLocaleLowerCase() !== deferred} className="max-h-[min(60dvh,480px)] overflow-y-auto overscroll-contain">
        {matches.slice(0, limit).map((entry, i) => <button key={entry.id + i} type="button"
          className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm leading-relaxed text-ink-2 hover:bg-sunk hover:text-ink"
          style={{ paddingLeft: entry.level > 1 ? 24 : 12 }}
          onClick={() => onJump(entry.id)}>{entry.title}</button>)}
        {!matches.length && <p role="status" className="py-4 text-sm text-ink-3">没有找到章节</p>}
        {matches.length > limit && <button type="button" onClick={() => setLimit(n => n + 60)} className="min-h-11 w-full text-sm text-rubric">显示更多（剩余 {matches.length - limit}）</button>}
      </div>
    </nav>;
}
