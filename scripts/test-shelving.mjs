import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
const events = {};
let requests = 0;
const library = [{id:"new"}, {id:"old",topic:"unsorted"}, {id:"manual",topic:"history"}, {id:"sample",origin:"sample"}];
globalThis.window = {addEventListener:(name,fn)=>events[name]=fn};
globalThis.fixture = {
  providerHeaders:()=>({}), readApiKey:()=>"", excerptOf:()=>"",
  loadDoc:async()=>null,
  useStore:{getState:()=>({library,shelve:(id,patch)=>Object.assign(library.find(x=>x.id===id),patch)})}
};
globalThis.fetch=async()=>{
  requests++;
  return Response.json({topic:"science",tags:[],scene:"A chalk cliff"});
};
let source=stripTypeScriptTypes(await readFile(new URL("../lib/shelving.ts",import.meta.url),"utf8"));
source=source.replace(/^import .*?;$/gm,"");
const mod=await import("data:text/javascript;base64,"+Buffer.from("const {providerHeaders,readApiKey,excerptOf,loadDoc,useStore}=globalThis.fixture;\n"+source).toString("base64"));
await mod.backfill(library);
assert.equal(requests,2);
assert.equal(library[0].topic,"science");
assert.equal(library[1].topic,"science");
assert.equal(library[2].topic,"history");
library.push({id:"race"});
fetch=async()=>{library.at(-1).topic="culture";return Response.json({topic:"science",tags:[]})};
await mod.shelveText({id:"race",title:"Race"});
assert.equal(library.at(-1).topic,"culture");
console.log("PASS: new and previously unsorted books classified, samples skipped, manual changes win.");
