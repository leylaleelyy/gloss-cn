import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
const source = await readFile(new URL("../components/reader/Lens.tsx", import.meta.url), "utf8");
const start = source.indexOf("    if (!rootEl) return;", source.indexOf("// Read the selection"));
const end = source.indexOf("  }, [rootEl, ix, close, saveNote, setUI]);", start);
assert.ok(start > 0 && end > start);
const callbacks = new Map(), rootCallbacks = new Map(), results = [];
const anchor = { quote:"中文 reading", start:{b:"b1",o:0}, end:{b:"b1",o:10} };
class Element { closest(selector) { return selector === ".blk-text" ? this : null; } }
const target = new Element();
const context = {
  Element, rootEl:{contains:()=>true, addEventListener:(k,v)=>rootCallbacks.set(k,v), removeEventListener:k=>rootCallbacks.delete(k)},
  document:{addEventListener:(k,v)=>callbacks.set(k,v),removeEventListener:k=>callbacks.delete(k)},
  window:{getSelection:()=>({}),matchMedia:()=>({matches:true})},
  boxRef:{current:null},lensRef:{current:null},dragging:{current:false},
  ix:{texts:new Map(),order:new Map()},selectionToAnchor:()=>anchor,
  setLens:v=>results.push(v),setUI(){},setPos(){},saveNote(){},close(){},
  setTimeout:fn=>{fn();return 1},clearTimeout(){}
};
const cleanup = vm.runInNewContext(stripTypeScriptTypes("(function(){"+source.slice(start,end)+"})()"),context);
callbacks.get("pointerdown")({pointerType:"touch",target});
callbacks.get("selectionchange")();
assert.equal(results.at(-1).anchor.quote,anchor.quote);
results.length=0;
callbacks.get("pointerdown")({pointerType:"mouse",target});
callbacks.get("selectionchange")();
assert.equal(results.length,0);
callbacks.get("pointercancel")();
assert.equal(results.at(-1).anchor.quote,anchor.quote);
let prevented=false;
rootCallbacks.get("contextmenu")({target,preventDefault(){prevented=true}});
assert.equal(prevented,true);
cleanup();
assert.equal(callbacks.size,0);
assert.equal(rootCallbacks.size,0);
console.log("PASS: touch selections update during native handoff, mouse drag waits, pointercancel recovers, prose callout interception and cleanup.");
