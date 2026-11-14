import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'wise-source-'));
try {
  const bundle = await build({stdin:{contents:"export {loadWiseWords} from './lib/word-wise-source'; export {writeWiseCache} from './lib/word-wise-cache';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
  const path = join(dir,'test.mjs'); await writeFile(path,bundle.outputFiles[0].text);
  const {loadWiseWords,writeWiseCache} = await import(path);
  let requests=0;
  globalThis.fetch=async()=>{requests++;return Response.json({error:'offline'},{status:503})};
  const signal=new AbortController().signal;
  const load=(key,network=true)=>loadWiseWords(key,'text','B1',signal,network,()=>{});
  await writeWiseCache('cached',[{word:'intricate',meaning:'complex'}]);
  await assert.rejects(load('fail'),/offline/);
  assert.deepEqual(await load('cached',false),[{word:'intricate',meaning:'complex'}]);
  assert.equal(await load('missing',false),undefined);assert.equal(requests,1);
  globalThis.fetch=async()=>Response.json({words:[{word:4,meaning:null}]});
  await assert.rejects(load('malformed'),/格式/);
  assert.equal(await load('malformed',false),undefined);
  globalThis.fetch=async()=>Response.json({words:[]});
  assert.deepEqual(await load('empty'),[]);assert.deepEqual(await load('empty',false),[]);
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(loadWiseWords('cached','text','B1',aborted.signal,true,()=>{}),{name:'AbortError'});
  console.log('PASS: cached hints survive provider failures; paused requests, malformed responses, empty cache and cancellation.');
} finally {await rm(dir,{recursive:true,force:true});}
