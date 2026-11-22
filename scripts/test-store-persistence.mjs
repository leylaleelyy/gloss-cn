import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'gloss-persistence-'));
try {
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  const values=new Map();let blocked=false;
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(blocked)throw Error('quota');values.set(k,v)},removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size}},configurable:true});
  const bundle=await build({entryPoints:['lib/store.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
  const path=join(dir,'store.mjs');await writeFile(path,bundle.outputFiles[0].text);
  const {useStore,flushStorePersistence}=await import(path);
  useStore.setState({hydrated:true});
  const saved=()=>JSON.parse(values.get('gloss:v2:progress:book')).block;
  useStore.getState().setProgress('book',{block:'p12',pct:.12,at:1});
  window.dispatchEvent(new Event('pagehide'));assert.equal(saved(),'p12');
  blocked=true;useStore.getState().setProgress('book',{block:'p13',pct:.13,at:2});flushStorePersistence();
  assert.equal(saved(),'p12');blocked=false;document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));assert.equal(saved(),'p13');
  console.log('PASS: immediate page exit and backgrounding flush persistence; failed storage retries retain latest progress.');
} finally {await rm(dir,{recursive:true,force:true});}
