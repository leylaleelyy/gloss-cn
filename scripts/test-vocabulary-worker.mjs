import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Worker as Thread } from 'node:worker_threads';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'gloss-worker-test-'));
const bundled = await build({ entryPoints: ['lib/vocabulary.worker.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
const runtime = `const {parentPort}=require('node:worker_threads');global.self={postMessage:data=>parentPort.postMessage(data)};${bundled.outputFiles[0].text}\nparentPort.on('message',data=>self.onmessage({data}));`;
let made = 0, ended = 0, inits = [];
class BrowserWorker {
  constructor() { made++; this.thread = new Thread(runtime, {eval:true}); this.thread.on('message',data=>this.onmessage?.({data})); this.thread.on('error',error=>this.onerror?.(error)); }
  postMessage(data) { if(data.type==='init') inits.push(data.entries); this.thread.postMessage(data); }
  terminate() { ended++; void this.thread.terminate(); }
}
globalThis.Worker = BrowserWorker;
try {
  const client = await build({entryPoints:['lib/vocabulary-worker.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
  const path = join(dir,'client.mjs'); await writeFile(path,client.outputFiles[0].text);
  const {acquireVocabularyComputer} = await import(pathToFileURL(path));
  const entries = [
    {id:'a',word:'intricate',surface:'intricate',status:'new',english:'with many parts joined in a complicated way',sources:[{sensitive:'not transferred'}]},
    {id:'b',word:'chalk',surface:'chalk',status:'mastered',english:'rock',sources:[]},
    ...Array.from({length:10000},(_,i)=>({id:'v'+i,word:'vocabulary'+i,surface:'vocabulary'+i,status:'new',english:'entry'})),
  ];
  const first=acquireVocabularyComputer(entries), second=acquireVocabularyComputer(entries);
  assert.equal(made,1);assert.equal(first.computer,second.computer);assert.ok(!('sources' in inits[0][0]));
  const text='😀 intricate chalk and obscure words.';
  const [hints,matches]=await Promise.all([first.computer.hints(text,[{word:'intricate',meaning:'complex'},{word:'chalk',meaning:'rock'},{word:'obscure',meaning:'unclear'}]),second.computer.matches(text)]);
  assert.deepEqual(hints.map(h=>text.slice(h.from,h.to)),['intricate','obscure']);assert.equal(hints[0].meaning,entries[0].english);assert.equal(hints[0].short,'complex');assert.equal(hints[1].short,'unclear');assert.equal(matches.length,1);assert.equal(matches[0].from,3);
  const controller=new AbortController();const cancelled=first.computer.matches('intricate '.repeat(10000),controller.signal);controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
  first.release();assert.equal(ended,0);second.release();assert.equal(ended,1);second.release();assert.equal(ended,1);
  const next=acquireVocabularyComputer([{...entries[0],status:'mastered'}]);assert.deepEqual(await next.computer.matches(text),[]);next.release();
  const disposed=acquireVocabularyComputer(entries);const pending=disposed.computer.matches(text);disposed.release();await assert.rejects(pending,{name:'AbortError'});
  globalThis.Worker=class {constructor(){throw Error('Worker blocked')}};
  const fallback=acquireVocabularyComputer(entries);assert.equal((await fallback.computer.hints(text,[]))[0].meaning,entries[0].english);fallback.release();
  console.log('PASS: actual Worker with 10,000-word notebook, shared lifecycle, no source transfer, Unicode offsets, mastery, short hints, cancellation, disposal, notebook replacement and restricted-browser fallback.');
} finally {await rm(dir,{recursive:true,force:true});}
