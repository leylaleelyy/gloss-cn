import assert from "node:assert/strict";
import { placeMargin } from "../lib/margin-layout.ts";

const item = (id, desired, h, group = id, mini = false) => ({ id, desired, anchorY: desired + 16, h, group, mini, created: 0 });
function check(items, active) {
  const tops = placeMargin(items, active);
  for (let i = 0; i < items.length; i++) {
    assert.ok(tops[items[i].id] >= 0);
    if (i) assert.ok(tops[items[i].id] >= tops[items[i-1].id] + items[i-1].h + 4, "Cards must never overlap");
  }
  return tops;
}
assert.deepEqual(placeMargin([], null), {});
for (const active of ["explain", "simplify", "define"]) {
  for (const height of [64, 350, 1200]) {
    const siblings = ["explain", "simplify", "define"].map(id => item(id, 300, id === active ? height : 30, "selection", id !== active));
    const items = [item("earlier", 50, 50), ...siblings, item("note", 320, 90), item("later", 800, 40)];
    const tops = check(items, active);
    assert.equal(tops.explain, 300, "Shared stack stays pinned when active sibling changes");
    check(items.map(x => ({...x, desired: x.desired - 300})), active);
  }
}
for (let n = 1; n <= 30; n++) {
  const items = Array.from({length:n}, (_,i)=>item(String(i), i*27, (i*73)%450+25, String(Math.floor(i/3)), i%2===0));
  for (const active of [null,...items.map(x=>x.id)]) check(items, active);
}
console.log("PASS: shared-selection switching, tall/streaming cards, neighboring notes, top boundary, and dense stacks stay disjoint.");
