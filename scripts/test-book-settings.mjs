import assert from "node:assert/strict";
import vm from "node:vm";
import { DEFAULT_SETTINGS, saveBookSettings, bookSettings, applySettings, BOOT_SCRIPT } from "../lib/settings.ts";
const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
globalThis.window = { location: { pathname: "/read/a" }, dispatchEvent() {}, matchMedia: () => ({matches:false}) };
globalThis.document = { documentElement: { dataset: {}, style: { setProperty(k,v) {this[k]=v;} } } };
saveBookSettings("a", {face:"huiwen",size:26,width:"wide",leading:"loose",align:"justify",paras:"indented"});
saveBookSettings("b", {face:"dyslexie",size:17,width:"narrow"});
assert.deepEqual(bookSettings("a"), {face:"huiwen",size:26,width:"wide",leading:"loose",align:"justify",paras:"indented"});
assert.equal(bookSettings("b").size,17);
assert.deepEqual(bookSettings("c"),{});
localStorage.setItem("gloss:book-face:legacy","arphic");
assert.equal(bookSettings("legacy").face,"arphic");
for (const [id,face,size] of [["a","huiwen",26],["b","dyslexie",17],["c","serif",20]]) {
  window.location.pathname="/read/"+id;
  applySettings(DEFAULT_SETTINGS);
  assert.equal(document.documentElement.dataset.face,face);
  assert.equal(document.documentElement.style["--read-size"],size+"px");
  const element={dataset:{},style:{setProperty(k,v){this[k]=v}}};
  localStorage.setItem("gloss:settings",JSON.stringify(DEFAULT_SETTINGS));
  vm.runInNewContext(BOOT_SCRIPT,{localStorage,document:{documentElement:element},window,location:window.location,matchMedia:window.matchMedia});
  if (id === "a") {
    assert.equal(element.dataset.align,"justify");
    assert.equal(element.dataset.paras,"indented");
    assert.equal(element.style["--leading"],1.82);
    assert.equal(element.style["--measure-k"],37);
  }
  assert.equal(element.dataset.face,face);
  assert.equal(element.style["--read-size"],size+"px");
}
saveBookSettings("a",{size:999,face:"invalid"});
assert.equal(bookSettings("a").size,26);
assert.equal(bookSettings("a").face,"huiwen");
console.log("PASS: independent books, all layout fields, legacy font migration, invalid values and first-paint restoration.");
