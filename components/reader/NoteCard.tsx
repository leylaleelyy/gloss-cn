"use client";

import { forwardRef } from "react";
import { ChevronsDownUp, PenLine, Trash2 } from "lucide-react";
import { MARKERS } from "@/lib/settings";
import { useStore, type Highlight } from "@/lib/store";
import { useReader } from "./context";
import { marginStyle } from "./GlossCard";

type Props = {
  note: Highlight;
  active: boolean;
  entering: boolean;
  /** A margin card's first placement: it appears in its place instead of gliding there from the top. */
  fresh?: boolean;
  /** Where a margin card stands; unknown until the margin is laid out, and hidden till then. */
  top?: number;
  onActivate: () => void;
  onEdit: () => void;
};

/**
 * The reader's own note, as a card in the margin. It reads like the gloss
 * cards beside it: quiet until opened, then the passage, the note, and the
 * ways to change it.
 */
export const NoteCard = forwardRef<HTMLElement, Props>(function NoteCard(
  { note, active, entering, fresh = false, top, onActivate, onEdit },
  ref
) {
  const { ix, jumpToBlock } = useReader();
  const updateHighlight = useStore((s) => s.updateHighlight);
  const setUI = useStore((s) => s.setUI);
  const n = ix.numbers.get(note.anchor.start.b);
  const where = n !== undefined ? `\u00b6${n}` : null;
  const color = MARKERS.find((m) => m.key === (note.color ?? "yellow"))?.color ?? "var(--rubric)";
  const style = { ...marginStyle(top, fresh), ["--note-c" as string]: color };

  const text = note.note ?? "";

  if (!active) {
    return (
      <article
        ref={ref}
        data-note={note.id}
        aria-label={`Note${n ? ` on paragraph ${n}` : ""}. Open note.`}
        role="button"
        tabIndex={0}
        className={["gloss is-collapsed note-card", entering ? "is-entering" : ""].join(" ")}
        style={style}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
      >
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-[13.5px] font-medium leading-[1.4] text-ink">Note</span>
          <span className="note-swatch" aria-hidden />
          {where && <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-4">{where}</span>}
        </div>
        <p className="note-text mt-1 line-clamp-3">{text}</p>
      </article>
    );
  }

  return (
    <article
      ref={ref}
      data-note={note.id}
      aria-label={`Note${n ? ` on paragraph ${n}` : ""}`}
      className={["gloss gloss-margin note-card is-active", entering ? "is-entering" : ""].join(" ")}
      style={style}
    >
      <header className="mb-2 flex h-5 items-center gap-2 text-[12px] leading-none">
        <span className="font-semibold text-rubric-text">Note</span>
        <span className="note-swatch" aria-hidden />
        {where && (
          <button
            type="button"
            className="cite !text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              jumpToBlock(note.anchor.start.b, { remember: true });
            }}
            aria-label={`Go to paragraph ${n}`}
            data-tip="Show in the text"
          >
            {where}
          </button>
        )}
        <button
          type="button"
          aria-label="Edit note"
          data-tip="Edit note"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="ml-auto -mr-1 grid size-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-sunk hover:text-ink"
        >
          <PenLine size={14} />
        </button>
        <button
          type="button"
          aria-label="Delete note"
          data-tip="Delete note"
          onClick={(e) => {
            e.stopPropagation();
            updateHighlight(note.articleId, note.id, { note: undefined });
            setUI({ activeHighlight: null });
          }}
          className="-mr-1 grid size-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-sunk hover:text-ink"
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          aria-label="Collapse note"
          data-tip="Collapse"
          data-tip-kbd="Esc"
          onClick={(e) => {
            e.stopPropagation();
            setUI({ activeHighlight: null });
          }}
          className="-mr-1.5 grid size-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-sunk hover:text-ink"
        >
          <ChevronsDownUp size={14} />
        </button>
      </header>

      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit note"
        className="block w-full text-left"
      >
        <span className="mb-2.5 block line-clamp-2 border-l-2 border-[var(--note-c)] pl-2.5 font-serif text-[15px] leading-snug text-ink-3">
          {note.anchor.quote}
        </span>
        <span className="note-text block whitespace-pre-line">{text}</span>
      </button>
    </article>
  );
});
