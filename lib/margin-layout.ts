/** Room between notes; one-line notes in a crowded stretch sit close, like a list. */
const GAP = 16;
const GAP_MINI = 4;

export type MarginItem = { id: string; desired: number; anchorY: number; h: number; created: number; mini: boolean; group: string };

const gapAfter = (a: MarginItem, b: MarginItem) => (a.mini && b.mini ? GAP_MINI : GAP);

/**
 * Pin the beginning of the active selection’s stack, not its changing active
 * card. Stable order and current heights keep every sibling disjoint.
 */
export function placeMargin(items: MarginItem[], activeId: string | null): Record<string, number> {
  const tops: number[] = items.map((it) => it.desired);
  const selected = activeId ? items.find((it) => it.id === activeId) : undefined;
  const ai = selected ? items.findIndex(it => it.group === selected.group) : -1;
  const forward = (from: number) => {
    for (let i = Math.max(1, from); i < items.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + items[i - 1].h + gapAfter(items[i - 1], items[i]));
  };
  if (ai < 0) {
    tops[0] = Math.max(0, tops[0] ?? 0);
    forward(1);
  } else {
    forward(ai + 1);
    for (let i = ai - 1; i >= 0; i--) tops[i] = Math.min(tops[i], tops[i + 1] - gapAfter(items[i], items[i + 1]) - items[i].h);
    if (tops[0] < 0) {
      tops[0] = 0;
      forward(1);
    }
  }
  const out: Record<string, number> = {};
  items.forEach((it, i) => (out[it.id] = tops[i]));
  return out;
}

